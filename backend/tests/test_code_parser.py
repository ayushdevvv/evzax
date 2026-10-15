from app.services.code_parser import chunk_code, parse_python_symbols, should_skip_path, language_for_path


def test_skips_dependency_and_secret_paths():
    assert should_skip_path("node_modules/react/index.js")
    assert should_skip_path("backend/.env")
    assert should_skip_path("id_rsa")
    assert not should_skip_path("backend/app/main.py")


def test_chunk_lines_are_one_based_and_contiguous_enough():
    source = "\n".join(f"line_{n} = {n}" for n in range(1, 220))
    chunks = chunk_code("src/main.py", source, max_lines=40, overlap=8)
    assert len(chunks) > 1
    assert chunks[0].line_start == 1
    assert all(chunk.line_end >= chunk.line_start for chunk in chunks)
    assert all(chunk.language == "python" for chunk in chunks)


def test_python_symbols_are_detected():
    source = "class Demo:\n    def run(self):\n        return True\n"
    symbols = parse_python_symbols("demo.py", source)
    assert {symbol["symbol"] for symbol in symbols} == {"Demo", "run"}


def test_secret_line_is_redacted_without_removing_line_count():
    source = 'API_KEY = "supersecret_example_value_123456"\nprint("hello")'
    chunks = chunk_code("src/settings.py", source)
    assert "supersecret_example_value" not in chunks[0].content
    assert "REDACTED" in chunks[0].content
    assert chunks[0].line_end == 2
