"""LaTeX template engine - JSON to moderncv LaTeX rendering."""

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader

from app.schemas.resume import ResumeData

TEMPLATE_DIR = Path(__file__).parent.parent / "templates"

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    block_start_string="<%",
    block_end_string="%>",
    variable_start_string="<<",
    variable_end_string=">>",
    comment_start_string="<#",
    comment_end_string="#>",
)



def _fix_latex_escapes(text: str) -> str:
    """Fix unescaped LaTeX special characters in text that may contain LaTeX commands.

    This is smart: it only escapes characters that are NOT already escaped
    and NOT part of LaTeX commands. Handles text from LLM that may have
    inconsistent escaping.
    """
    if not text:
        return ""

    # Characters that need escaping in LaTeX: & % $ # _ { } ~ ^
    # But we must NOT escape ones already preceded by backslash,
    # and NOT touch backslash-commands like \textbf, \%, etc.

    # Step 1: Fix unescaped & (not preceded by \)
    text = re.sub(r'(?<!\\)&', r'\\&', text)

    # Step 2: Fix unescaped % (not preceded by \)
    text = re.sub(r'(?<!\\)%', r'\\%', text)

    # Step 3: Fix unescaped $ (not preceded by \)
    text = re.sub(r'(?<!\\)\$', r'\\$', text)

    # Step 4: Fix unescaped # (not preceded by \)
    text = re.sub(r'(?<!\\)#', r'\\#', text)

    # Step 5: Fix unescaped _ (not preceded by \)
    # But be careful: \_ is valid, and _ in \textbf{} is fine inside commands
    text = re.sub(r'(?<!\\)_', r'\\_', text)

    # Step 6: Fix unescaped ~ (not preceded by \, not \textasciitilde)
    # Only fix standalone ~ not part of a command
    text = re.sub(r'(?<!\\)~(?!{)', r'\\textasciitilde{}', text)

    # Step 7: Fix unescaped ^ (not preceded by \)
    text = re.sub(r'(?<!\\)\^(?!{)', r'\\textasciicircum{}', text)

    # Note: We do NOT escape { } or \ because they are part of LaTeX commands
    # The LLM output should preserve command structure like \textbf{...}

    # Fix double-escaping that might occur (e.g., \\& -> should stay \&)
    text = text.replace('\\\\&', '\\&')
    text = text.replace('\\\\%', '\\%')
    text = text.replace('\\\\$', '\\$')
    text = text.replace('\\\\#', '\\#')
    text = text.replace('\\\\_', '\\_')

    return text


# Register filter now that the function is defined
_env.filters["texsafe"] = _fix_latex_escapes


def render_resume_latex(data: ResumeData) -> str:
    """Render structured resume data to moderncv LaTeX source.

    All text fields are passed through |texsafe filter to ensure
    special characters are properly escaped for compilation.
    """
    template = _env.get_template("moderncv.tex.j2")
    return template.render(resume=data)


def generate_filename(data: ResumeData, suffix: str = "") -> str:
    """Generate a filename for the LaTeX file."""
    name = f"{data.personal_info.first_name}_{data.personal_info.last_name}"
    name = re.sub(r"[^a-zA-Z0-9_]", "", name)
    if suffix:
        return f"{name}_Resume_{suffix}.tex"
    return f"{name}_Resume.tex"
