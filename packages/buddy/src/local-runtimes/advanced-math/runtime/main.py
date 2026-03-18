from __future__ import annotations

import ast
import contextlib
import io
import json
import os
import pathlib
import sys
import traceback
import uuid
import warnings


SUPPORTED_LIBRARIES = [
    "math",
    "sympy",
    "numpy",
    "pandas",
    "xarray",
    "scipy",
    "matplotlib",
    "seaborn",
]


def _exec_with_last_expression(source: str) -> tuple[str | None, dict[str, object]]:
    tree = ast.parse(source, mode="exec")
    namespace: dict[str, object] = {"__name__": "__main__"}

    if tree.body and isinstance(tree.body[-1], ast.Expr):
        expression = ast.Expression(tree.body[-1].value)
        body = ast.Module(body=tree.body[:-1], type_ignores=[])
        ast.fix_missing_locations(body)
        ast.fix_missing_locations(expression)
        exec(compile(body, "<python_calculator>", "exec"), namespace, namespace)
        value = eval(compile(expression, "<python_calculator>", "eval"), namespace, namespace)
        if value is None:
            return None, namespace
        return repr(value), namespace

    exec(compile(tree, "<python_calculator>", "exec"), namespace, namespace)
    return None, namespace


def _save_figures(artifact_directory: str) -> list[str]:
    os.environ.setdefault("MPLBACKEND", "Agg")
    import matplotlib.pyplot as plt

    output_dir = pathlib.Path(artifact_directory)
    output_dir.mkdir(parents=True, exist_ok=True)

    paths: list[str] = []
    for figure_number in plt.get_fignums():
        figure = plt.figure(figure_number)
        filename = f"figure-{figure_number}-{uuid.uuid4().hex}.png"
        target = output_dir / filename
        figure.savefig(target, format="png", bbox_inches="tight")
        paths.append(str(target))

    plt.close("all")
    return paths


def _prepare_plotting_runtime() -> None:
    os.environ.setdefault("MPLBACKEND", "Agg")
    warnings.filterwarnings(
        "ignore",
        message="FigureCanvasAgg is non-interactive, and thus cannot be shown",
        category=UserWarning,
    )

    with contextlib.suppress(Exception):
        import matplotlib.pyplot as plt

        plt.ioff()

        def _headless_show(*args: object, **kwargs: object) -> None:
            return None

        plt.show = _headless_show


def self_check() -> int:
    sys.stderr.write("advanced math runtime self-check ok\n")
    return 0


def execute() -> int:
    request = json.loads(sys.stdin.read())
    code = request["code"]
    working_directory = request["workingDirectory"]
    artifact_directory = request["artifactDirectory"]
    os.environ.setdefault("MPLBACKEND", "Agg")

    stdout_buffer = io.StringIO()
    stderr_buffer = io.StringIO()
    previous_cwd = os.getcwd()
    last_expression_output: str | None = None
    artifacts: list[str] = []

    try:
        os.makedirs(working_directory, exist_ok=True)
        os.chdir(working_directory)
        _prepare_plotting_runtime()
        with contextlib.redirect_stdout(stdout_buffer), contextlib.redirect_stderr(stderr_buffer):
            last_expression_output, _ = _exec_with_last_expression(code)
        artifacts = _save_figures(artifact_directory)
        payload = {
            "ok": True,
            "stdout": stdout_buffer.getvalue(),
            "stderr": stderr_buffer.getvalue(),
            "artifacts": artifacts,
        }
        if last_expression_output is not None:
            payload["lastExpressionOutput"] = last_expression_output
    except Exception as error:  # noqa: BLE001
        traceback.print_exc(file=stderr_buffer)
        payload = {
            "ok": False,
            "stdout": stdout_buffer.getvalue(),
            "stderr": stderr_buffer.getvalue(),
            "artifacts": artifacts,
            "error": str(error),
        }
        if last_expression_output is not None:
            payload["lastExpressionOutput"] = last_expression_output
    finally:
        os.chdir(previous_cwd)

    sys.stdout.write(json.dumps(payload))
    return 0


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else ""
    if command == "self-check":
        return self_check()
    if command == "execute":
        return execute()

    sys.stderr.write(f"Unknown command: {command}\n")
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
