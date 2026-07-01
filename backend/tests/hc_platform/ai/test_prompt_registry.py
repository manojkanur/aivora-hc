"""PromptRegistry render() + get() unit tests (in-memory stubs)."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.hc_platform.prompt_registry import PromptRegistry


def _tpl(**kwargs) -> SimpleNamespace:
    defaults = {
        "key": "executive_summary_v1",
        "version": 1,
        "system_prompt": "You are a {{role}}.",
        "user_prompt_template": "Context:\n{{context}}\n\nFocus on {{focus}}.",
        "is_active": True,
        "model_name": "gpt-4o-mini",
        "temperature": 0.2,
        "max_tokens": 1500,
        "response_format": "json_object",
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def test_render_substitutes_simple_placeholders() -> None:
    tpl = _tpl()
    messages = PromptRegistry.render(
        tpl,
        {"role": "consultant", "context": "Acme Corp", "focus": "succession"},
    )
    assert messages[0]["role"] == "system"
    assert "consultant" in messages[0]["content"]
    assert messages[1]["role"] == "user"
    assert "Acme Corp" in messages[1]["content"]
    assert "succession" in messages[1]["content"]


def test_render_resolves_dotted_paths() -> None:
    tpl = _tpl(
        system_prompt="",
        user_prompt_template="Company: {{review.company_name}}",
    )
    messages = PromptRegistry.render(
        tpl, {"review": {"company_name": "Foo Ltd"}}
    )
    assert messages == [{"role": "user", "content": "Company: Foo Ltd"}]


def test_render_serialises_dict_values_as_json() -> None:
    tpl = _tpl(system_prompt="", user_prompt_template="{{ctx}}")
    messages = PromptRegistry.render(tpl, {"ctx": {"a": 1, "b": [2, 3]}})
    body = messages[0]["content"]
    # Sorted keys, no spaces — produced by json.dumps(sort_keys=True).
    assert body == '{"a": 1, "b": [2, 3]}'


def test_render_missing_placeholder_collapses_to_empty() -> None:
    tpl = _tpl(system_prompt="", user_prompt_template="X={{missing}}|Y={{also.missing}}")
    messages = PromptRegistry.render(tpl, {})
    assert messages[0]["content"] == "X=|Y="


def test_render_drops_empty_system_message() -> None:
    tpl = _tpl(system_prompt=None, user_prompt_template="hi")
    messages = PromptRegistry.render(tpl, {})
    assert messages == [{"role": "user", "content": "hi"}]


# ---- async get() tests using an in-memory stub session -------------------


class _StubResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return SimpleNamespace(all=lambda: list(self._value or []))


class _StubSession:
    """Captures the last statement executed and returns a configured result."""

    def __init__(self, rows: list):
        self.rows = rows
        self.last_stmt = None

    async def execute(self, stmt):
        self.last_stmt = stmt
        # Compile to text so the tests can assert on the SQL shape.
        sql = str(stmt.compile(compile_kwargs={"literal_binds": True}))
        # Return the first row if .limit(1) was set; tests configure self.rows.
        first = self.rows[0] if self.rows else None
        return SimpleNamespace(
            scalar_one_or_none=lambda: first,
            scalars=lambda: SimpleNamespace(all=lambda: list(self.rows)),
            _sql=sql,
        )


import pytest  # noqa: E402


@pytest.mark.asyncio
async def test_get_raises_when_template_missing() -> None:
    session = _StubSession(rows=[])
    with pytest.raises(LookupError):
        await PromptRegistry.get(session, key="nope")  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_get_returns_row_when_present() -> None:
    expected = _tpl(version=3)
    session = _StubSession(rows=[expected])
    got = await PromptRegistry.get(session, key="executive_summary_v1")  # type: ignore[arg-type]
    assert got is expected


@pytest.mark.asyncio
async def test_get_filters_by_version_when_passed() -> None:
    expected = _tpl(version=2)
    session = _StubSession(rows=[expected])
    await PromptRegistry.get(session, key="executive_summary_v1", version=2)  # type: ignore[arg-type]
    sql = str(
        session.last_stmt.compile(compile_kwargs={"literal_binds": True})
    )
    assert "version = 2" in sql.replace('"', "")
