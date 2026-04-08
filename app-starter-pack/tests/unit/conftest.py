"""
conftest.py — stub out all heavy external packages not installed in the bare
test environment (they live inside the Poetry virtualenv).
Must run before any production module is imported.
"""

import os
import sys
from unittest.mock import AsyncMock, MagicMock

# ── Add service/ directory to sys.path so `import app.*` resolves correctly ──
_SERVICE_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "../../service")
)
if _SERVICE_DIR not in sys.path:
    sys.path.insert(0, _SERVICE_DIR)

# ── Global env vars needed before any module-level code runs ─────────────────
os.environ.setdefault("FIRESTORE_PROJECT", "test-project")
os.environ.setdefault("GOOGLE_API_KEY", "test-api-key")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:5173")
os.environ.setdefault("WS_SECRET", "")


def _ensure_module(dotted: str) -> MagicMock:
    """Return the mock for `dotted`, creating it and all parents if needed.

    Each level gets its own MagicMock; parent.child is set correctly so that
    attribute access through the hierarchy works.
    """
    if dotted in sys.modules:
        return sys.modules[dotted]

    parts = dotted.split(".")
    mock = MagicMock(name=dotted)
    sys.modules[dotted] = mock

    # Ensure every ancestor exists and has the correct child attribute set
    for depth in range(1, len(parts)):
        parent_name = ".".join(parts[:depth])
        child_attr = parts[depth]
        child_name = ".".join(parts[: depth + 1])

        if parent_name not in sys.modules:
            sys.modules[parent_name] = MagicMock(name=parent_name)

        child_mock = sys.modules.get(child_name, mock if child_name == dotted else MagicMock(name=child_name))
        sys.modules.setdefault(child_name, child_mock)
        setattr(sys.modules[parent_name], child_attr, sys.modules[child_name])

    return mock


# ── google.cloud.logging ──────────────────────────────────────────────────────
_gcl = _ensure_module("google.cloud.logging")
_gcl_client_instance = MagicMock()
_gcl_client_instance.logger.return_value = MagicMock()
_gcl_client_instance.setup_logging = MagicMock()
_gcl.Client.return_value = _gcl_client_instance

# ── google.auth + google.auth.credentials ────────────────────────────────────
_ga = _ensure_module("google.auth")
_mock_creds = MagicMock()
_mock_creds.valid = True
_mock_creds.token = "fake-token"
_ga.default.return_value = (_mock_creds, "mock-project-id")

_ga_creds = _ensure_module("google.auth.credentials")
_ga_creds.Credentials = MagicMock(name="Credentials")
setattr(_ga, "credentials", _ga_creds)

_ensure_module("google.auth.transport.requests")

# ── google.genai and sub-modules ─────────────────────────────────────────────
_genai = _ensure_module("google.genai")
_genai_types = _ensure_module("google.genai.types")
_genai_live = _ensure_module("google.genai.live")

for _cls_name in [
    "LiveConnectConfig", "SpeechConfig", "VoiceConfig", "PrebuiltVoiceConfig",
    "GenerationConfig", "AudioTranscriptionConfig", "ContextWindowCompressionConfig",
    "SlidingWindow", "Content", "Tool", "FunctionDeclaration",
    "LiveClientToolResponse", "FunctionResponse", "LiveServerMessage",
]:
    setattr(_genai_types, _cls_name, MagicMock(name=_cls_name))

_genai_types.LiveServerToolCall = MagicMock(name="LiveServerToolCall")
_genai_live.AsyncSession = MagicMock(name="AsyncSession")

# ── vertexai ──────────────────────────────────────────────────────────────────
_vertexai = _ensure_module("vertexai")
_vertexai.init = MagicMock()

# ── google.cloud.aiplatform ───────────────────────────────────────────────────
_ensure_module("google.cloud.aiplatform")

# ── firebase_admin ────────────────────────────────────────────────────────────
_fa = _ensure_module("firebase_admin")
_fa._apps = {}
_fa.initialize_app = MagicMock()
_fa_fs = _ensure_module("firebase_admin.firestore")
_fa_fs.client.return_value = MagicMock()
_ensure_module("firebase_admin.firestore_async")
_ensure_module("firebase_admin.credentials")

# ── googlemaps ────────────────────────────────────────────────────────────────
_gm = _ensure_module("googlemaps")
_gm.Client.return_value = MagicMock()

# ── langchain ecosystem ───────────────────────────────────────────────────────
for _pkg in [
    "langchain", "langchain.prompts",
    "langchain_core", "langchain_core.prompts",
    "langchain_community",
    "langchain_community.document_loaders",
    "langchain_community.vectorstores",
    "langchain_google_vertexai",
    "langchain_google_vertexai.embeddings",
]:
    _ensure_module(_pkg)

# ── sklearn ───────────────────────────────────────────────────────────────────
_ensure_module("sklearn")
_ensure_module("sklearn.metrics")
_ensure_module("sklearn.metrics.pairwise")

# ── websockets.exceptions — make ConnectionClosedError a real exception ───────
try:
    from websockets.exceptions import ConnectionClosedError  # noqa: F401
except ModuleNotFoundError:
    _ws_exc = _ensure_module("websockets.exceptions")
    _ws = _ensure_module("websockets")

    class _ConnClosedError(Exception):
        def __init__(self, rcvd=None, sent=None):
            super().__init__(str(rcvd))

    _ws_exc.ConnectionClosedError = _ConnClosedError
    setattr(_ws, "exceptions", _ws_exc)

# ── backoff ───────────────────────────────────────────────────────────────────
try:
    import backoff  # noqa: F401
except ModuleNotFoundError:
    _backoff = _ensure_module("backoff")
    _backoff.on_exception = lambda *a, **kw: (lambda f: f)
    _backoff.expo = MagicMock()
    _backoff._typing = MagicMock()

# ── app.vector_store (local module with heavy langchain deps) ─────────────────
_app_vs = MagicMock(name="app.vector_store")
_app_vs.get_vector_store = MagicMock(return_value=MagicMock())
sys.modules["app.vector_store"] = _app_vs

# ── httpx (used by app.server for /api/routes proxy) ─────────────────────────
try:
    import httpx  # noqa: F401
except ModuleNotFoundError:
    _ensure_module("httpx")

# ── starlette StaticFiles — disable directory check in tests ─────────────────
try:
    import starlette.staticfiles as _ssf
    _OriginalStaticFiles = _ssf.StaticFiles

    class _NoCheckStaticFiles(_OriginalStaticFiles):
        def __init__(self, *args, **kwargs):
            kwargs["check_dir"] = False
            super().__init__(*args, **kwargs)

    _ssf.StaticFiles = _NoCheckStaticFiles
    # Also patch via fastapi.staticfiles if imported
    try:
        import fastapi.staticfiles as _fssf
        _fssf.StaticFiles = _NoCheckStaticFiles
    except Exception:
        pass
except Exception:
    pass
