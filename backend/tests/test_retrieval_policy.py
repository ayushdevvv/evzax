from app.services.retrieval_policy import choose_retrieval_policy


def test_greetings_skip_paid_retrieval():
    policy = choose_retrieval_policy("Hey!")
    assert policy["mode"] == "no_retrieval"
    assert policy["code_k"] == 0


def test_stack_trace_questions_use_deep_hybrid_retrieval():
    policy = choose_retrieval_policy("Help debug this stack trace and trace the request flow across files")
    assert policy["mode"] == "deep_hybrid"
    assert policy["code_k"] > 8
    assert policy["document_k"] > 3


def test_specific_filename_uses_targeted_retrieval():
    policy = choose_retrieval_policy("Explain backend/auth.py")
    assert policy["mode"] == "targeted_hybrid"
    assert policy["code_k"] < 8
