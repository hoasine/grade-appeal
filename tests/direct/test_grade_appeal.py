"""Behavioral tests for GradeAppeal."""

import json

import pytest

CONTRACT = "contracts/grade_appeal.py"
SDK_VERSION = "v0.2.16"
STAKE = 50_000_000_000_000_000  # 0.05 GEN
APPEAL_WINDOW = 7 * 24 * 60 * 60
TEACHER_RESPONSE_WINDOW = 3 * 24 * 60 * 60
_DIRECT_VM = None

RUBRIC = (
    "Rubric (out of 10):\n"
    "8-10: Correct algorithm + clear complexity analysis + edge cases.\n"
    "5-7: Mostly correct with minor gaps.\n"
    "0-4: Major errors or missing analysis."
)
JUSTIFICATION = (
    "Student had the right idea but missed Big-O analysis and one edge case. Score 6/10."
)
EVIDENCE = (
    "Submission included O(n log n) analysis in section 3 and handled empty-input edge case. "
    "Teacher justification overlooked both."
)


def _verdict(verdict: str, recommended: str = "6") -> str:
    return json.dumps(
        {
            "verdict": verdict,
            "recommended_score": recommended,
            "confidence": 8,
            "reasoning": "Mocked rubric arbitration.",
        }
    )


@pytest.fixture
def contract(direct_vm, direct_deploy, direct_alice):
    global _DIRECT_VM
    _DIRECT_VM = direct_vm
    direct_vm.mock_llm(r".*", _verdict("UPHOLD_ORIGINAL", "6"))
    direct_vm.sender = direct_alice
    return direct_deploy(CONTRACT, sdk_version=SDK_VERSION)


def _payable(contract, method: str, *args, value: int):
    previous = _DIRECT_VM.value
    _DIRECT_VM.value = value
    try:
        return getattr(contract, method)(*args)
    finally:
        _DIRECT_VM.value = previous


def _expire_response_window(contract, appeal_id: int = 0):
    """Simulate elapsed teacher-response window without waiting real time."""
    contract.appeals[appeal_id].response_deadline_at = contract.appeals[appeal_id].created_at


def _file_student_appeal(contract, direct_vm, direct_bob, grade_id: int = 0):
    direct_vm.sender = direct_bob
    contract.sender = direct_bob
    _payable(
        contract,
        "file_appeal",
        grade_id,
        "Score should be 9 because complexity analysis and edge cases were present.",
        EVIDENCE,
        "9",
        value=STAKE,
    )


def _publish(contract, student, appeal_window_seconds: int = 0):
    _payable(
        contract,
        "publish_grade",
        student,
        "CS201",
        "Sorting analysis homework",
        "6",
        "10",
        RUBRIC,
        JUSTIFICATION,
        appeal_window_seconds,
        value=STAKE,
    )


class TestPublish:
    def test_publish_grade(self, contract, direct_bob):
        _publish(contract, direct_bob)
        grade = contract.get_grade(0)
        assert grade["status"] == "PUBLISHED"
        assert grade["score"] == "6"
        assert grade["max_score"] == "10"
        assert grade["stake"] == STAKE
        assert grade["student"].lower() == direct_bob.as_hex.lower()
        assert grade["appeal_deadline_at"] >= grade["created_at"] + APPEAL_WINDOW
        cfg = contract.get_protocol_config()
        assert cfg["default_appeal_window"] == APPEAL_WINDOW
        assert cfg["teacher_response_window"] == TEACHER_RESPONSE_WINDOW

    def test_rejects_self_grade(self, contract, direct_alice):
        with pytest.raises(Exception):
            _payable(
                contract,
                "publish_grade",
                direct_alice,
                "CS201",
                "Homework",
                "8",
                "10",
                RUBRIC,
                JUSTIFICATION,
                0,
                value=STAKE,
            )

    def test_rejects_score_above_max(self, contract, direct_bob):
        with pytest.raises(Exception):
            _payable(
                contract,
                "publish_grade",
                direct_bob,
                "CS201",
                "Homework",
                "12",
                "10",
                RUBRIC,
                JUSTIFICATION,
                0,
                value=STAKE,
            )

    def test_rejects_low_stake(self, contract, direct_bob):
        with pytest.raises(Exception):
            _payable(
                contract,
                "publish_grade",
                direct_bob,
                "CS201",
                "Homework",
                "6",
                "10",
                RUBRIC,
                JUSTIFICATION,
                0,
                value=1,
            )


class TestAppealFlow:
    def test_student_raise_grade_with_teacher_response(self, contract, direct_vm, direct_alice, direct_bob):
        _publish(contract, direct_bob)
        direct_vm.sender = direct_bob
        contract.sender = direct_bob
        _payable(
            contract,
            "file_appeal",
            0,
            "Score should be 9 because complexity analysis and edge cases were present.",
            EVIDENCE,
            "9",
            value=STAKE,
        )
        grade = contract.get_grade(0)
        assert grade["status"] == "APPEALED"
        assert grade["has_open_appeal"] is True
        appeal = contract.get_appeal(0)
        assert appeal["response_deadline_at"] >= appeal["created_at"] + TEACHER_RESPONSE_WINDOW

        direct_vm.sender = direct_alice
        contract.sender = direct_alice
        contract.respond_to_appeal(0, "I re-checked and still believe Big-O section was incomplete.")

        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _verdict("RAISE_GRADE", "9"))
        contract.judge_appeal(0)

        appeal = contract.get_appeal(0)
        grade = contract.get_grade(0)
        assert appeal["status"] == "JUDGED"
        assert appeal["verdict"] == "RAISE_GRADE"
        assert "Big-O" in appeal["teacher_response"]
        assert appeal["paid_out"] is True
        assert grade["status"] == "SETTLED"
        assert grade["final_score"] == "9"
        assert grade["final_verdict"] == "RAISE_GRADE"
        assert grade["has_open_appeal"] is False
        assert grade["stake"] == 0

    def test_rejects_premature_judge_before_teacher_response(
        self, contract, direct_vm, direct_alice, direct_bob
    ):
        _publish(contract, direct_bob)
        _file_student_appeal(contract, direct_vm, direct_bob)
        appeal = contract.get_appeal(0)
        assert appeal["teacher_response"] == ""
        assert appeal["status"] == "OPEN"

        with pytest.raises(Exception, match="Cannot judge yet"):
            contract.judge_appeal(0)

        still_open = contract.get_appeal(0)
        grade = contract.get_grade(0)
        assert still_open["status"] == "OPEN"
        assert still_open["paid_out"] is False
        assert grade["status"] == "APPEALED"
        assert grade["has_open_appeal"] is True
        assert grade["stake"] == STAKE

        direct_vm.sender = direct_alice
        contract.sender = direct_alice
        contract.respond_to_appeal(0, "I reviewed the appeal and stand by the original score.")
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _verdict("UPHOLD_ORIGINAL", "6"))
        contract.judge_appeal(0)
        judged = contract.get_appeal(0)
        assert judged["status"] == "JUDGED"
        assert judged["paid_out"] is True

    def test_judge_allowed_after_response_window_expires_without_reply(
        self, contract, direct_vm, direct_bob
    ):
        _publish(contract, direct_bob)
        _file_student_appeal(contract, direct_vm, direct_bob)
        with pytest.raises(Exception, match="Cannot judge yet"):
            contract.judge_appeal(0)
        _expire_response_window(contract)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _verdict("INCONCLUSIVE", "6"))
        contract.judge_appeal(0)
        appeal = contract.get_appeal(0)
        grade = contract.get_grade(0)
        assert appeal["teacher_response"] == ""
        assert appeal["status"] == "JUDGED"
        assert appeal["verdict"] == "INCONCLUSIVE"
        assert grade["status"] == "SETTLED"

    def test_uphold_original(self, contract, direct_vm, direct_bob):
        _publish(contract, direct_bob)
        direct_vm.sender = direct_bob
        contract.sender = direct_bob
        _payable(
            contract,
            "file_appeal",
            0,
            "I want a higher grade",
            "I tried hard but do not show missing rubric criteria were met.",
            "10",
            value=STAKE,
        )
        _expire_response_window(contract)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _verdict("UPHOLD_ORIGINAL", "6"))
        contract.judge_appeal(0)
        appeal = contract.get_appeal(0)
        grade = contract.get_grade(0)
        assert appeal["verdict"] == "UPHOLD_ORIGINAL"
        assert grade["final_score"] == "6"
        assert grade["status"] == "SETTLED"

    def test_maps_lower_grade_to_inconclusive(self, contract, direct_vm, direct_bob):
        _publish(contract, direct_bob)
        direct_vm.sender = direct_bob
        contract.sender = direct_bob
        _payable(
            contract,
            "file_appeal",
            0,
            "Please reconsider",
            EVIDENCE,
            "8",
            value=STAKE,
        )
        _expire_response_window(contract)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _verdict("LOWER_GRADE", "4"))
        contract.judge_appeal(0)
        appeal = contract.get_appeal(0)
        grade = contract.get_grade(0)
        assert appeal["verdict"] == "INCONCLUSIVE"
        assert grade["final_score"] == "6"
        assert grade["status"] == "SETTLED"

    def test_only_student_can_appeal(self, contract, direct_bob):
        _publish(contract, direct_bob)
        with pytest.raises(Exception):
            _payable(
                contract,
                "file_appeal",
                0,
                "Not my grade",
                "Should fail",
                "8",
                value=STAKE,
            )

    def test_one_shot_appeal(self, contract, direct_vm, direct_bob):
        _publish(contract, direct_bob)
        direct_vm.sender = direct_bob
        contract.sender = direct_bob
        _payable(
            contract,
            "file_appeal",
            0,
            "First appeal",
            EVIDENCE,
            "9",
            value=STAKE,
        )
        _expire_response_window(contract)
        direct_vm.mock_llm(r".*", _verdict("UPHOLD_ORIGINAL", "6"))
        contract.judge_appeal(0)
        with pytest.raises(Exception):
            _payable(
                contract,
                "file_appeal",
                0,
                "Second appeal should fail",
                EVIDENCE,
                "9",
                value=STAKE,
            )

    def test_student_can_cancel_open_appeal(self, contract, direct_vm, direct_bob):
        _publish(contract, direct_bob)
        direct_vm.sender = direct_bob
        contract.sender = direct_bob
        _payable(
            contract,
            "file_appeal",
            0,
            "Changed my mind",
            EVIDENCE,
            "9",
            value=STAKE,
        )
        contract.cancel_appeal(0)
        appeal = contract.get_appeal(0)
        grade = contract.get_grade(0)
        assert appeal["status"] == "CANCELLED"
        assert appeal["paid_out"] is True
        assert appeal["stake"] == 0
        assert grade["status"] == "PUBLISHED"
        assert grade["has_open_appeal"] is False
        assert grade["appeal_count"] == 1
        # Teacher stake remains locked.
        assert grade["stake"] == STAKE
        # One-shot: cannot appeal again after cancel.
        with pytest.raises(Exception):
            _payable(
                contract,
                "file_appeal",
                0,
                "Try again",
                EVIDENCE,
                "9",
                value=STAKE,
            )

    def test_cannot_cancel_after_judge(self, contract, direct_vm, direct_bob):
        _publish(contract, direct_bob)
        direct_vm.sender = direct_bob
        contract.sender = direct_bob
        _payable(
            contract,
            "file_appeal",
            0,
            "Please raise",
            EVIDENCE,
            "9",
            value=STAKE,
        )
        _expire_response_window(contract)
        direct_vm.mock_llm(r".*", _verdict("UPHOLD_ORIGINAL", "6"))
        contract.judge_appeal(0)
        with pytest.raises(Exception):
            contract.cancel_appeal(0)


class TestCloseAndViews:
    def test_cannot_close_before_deadline(self, contract, direct_bob):
        _publish(contract, direct_bob)
        with pytest.raises(Exception):
            contract.close_grade(0)

    def test_teacher_closes_after_deadline(self, contract, direct_bob):
        _publish(contract, direct_bob)
        # Simulate elapsed appeal window (same pattern as Evidence Escrow tests).
        contract.grades[0].appeal_deadline_at = contract.grades[0].created_at
        contract.close_grade(0)
        grade = contract.get_grade(0)
        assert grade["closed"] is True
        assert grade["status"] == "CLOSED"
        assert grade["stake"] == 0
        assert grade["final_score"] == "6"

    def test_list_filters(self, contract, direct_bob):
        from genlayer.py.types import Address

        _publish(contract, direct_bob)
        grade = contract.get_grade(0)
        all_grades = contract.get_all_grades()
        by_student = contract.get_grades_for_student(direct_bob)
        by_teacher = contract.get_grades_for_teacher(Address(grade["teacher"]))
        assert len(all_grades) == 1
        assert len(by_student) == 1
        assert len(by_teacher) == 1
        assert by_teacher[0]["id"] == 0


class TestFairnessLedger:
    def test_ledger_starts_empty(self, contract):
        ledger = contract.get_fairness_ledger()
        assert ledger["uphold"] == 0
        assert ledger["raise"] == 0
        assert ledger["inconclusive"] == 0
        assert ledger["cancelled"] == 0
        assert ledger["judged"] == 0
        assert ledger["judged_without_teacher_response"] == 0

    def test_ledger_records_teacher_reply_and_silent_judgment(
        self, contract, direct_vm, direct_alice, direct_bob
    ):
        _publish(contract, direct_bob)
        _file_student_appeal(contract, direct_vm, direct_bob)
        contract.cancel_appeal(0)
        after_cancel = contract.get_fairness_ledger()
        assert after_cancel["cancelled"] == 1
        assert after_cancel["judged"] == 0

        direct_vm.sender = direct_alice
        contract.sender = direct_alice
        _publish(contract, direct_bob)
        _file_student_appeal(contract, direct_vm, direct_bob, 1)
        _expire_response_window(contract, 1)
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _verdict("INCONCLUSIVE", "6"))
        contract.judge_appeal(1)
        silent = contract.get_appeal(1)
        ledger = contract.get_fairness_ledger()
        assert silent["judged_without_teacher_response"] is True
        assert silent["responded_at"] == 0
        assert ledger["inconclusive"] == 1
        assert ledger["judged"] == 1
        assert ledger["judged_without_teacher_response"] == 1
        assert ledger["cancelled"] == 1

        direct_vm.sender = direct_alice
        contract.sender = direct_alice
        _publish(contract, direct_bob)
        _file_student_appeal(contract, direct_vm, direct_bob, 2)
        direct_vm.sender = direct_alice
        contract.sender = direct_alice
        contract.respond_to_appeal(2, "I stand by the original 6/10.")
        direct_vm.clear_mocks()
        direct_vm.mock_llm(r".*", _verdict("RAISE_GRADE", "9"))
        contract.judge_appeal(2)
        replied = contract.get_appeal(2)
        ledger = contract.get_fairness_ledger()
        assert replied["judged_without_teacher_response"] is False
        assert replied["responded_at"] > 0
        assert ledger["raise"] == 1
        assert ledger["judged"] == 2
        assert ledger["judged_without_teacher_response"] == 1

