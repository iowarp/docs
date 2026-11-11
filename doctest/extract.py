#!/usr/bin/env python3
"""Extract ```cpp fenced code blocks from the docs Markdown into compilable
translation units, one .cc per source .md.

Every code example in the docs must compile against the real clio headers (that
is what makes it a "directly tested" example). This tool pulls each ```cpp block
out of a .md file and emits a single .cc:

  * all `#include` lines are hoisted to the top, de-duplicated and order-kept;
  * a block that defines top-level entities (function / class / struct / enum /
    namespace / template / using / typedef / constant) is emitted verbatim at
    file scope;
  * a block that is a bare statement fragment is wrapped in a uniquely named
    `static void _doc_block_<n>()` so it type-checks as a function body.

The generated TUs are compile-only fixtures: the CMake target in this directory
compiles them but does not link/run (a bare API-usage check). Blocks that cannot
be made to compile must be fixed or removed from the docs.

Usage:
  python extract.py <out_dir> <file_or_dir> [<file_or_dir> ...]
"""
import os
import re
import sys

FENCE = re.compile(r"^\s*```(cpp|c\+\+|cxx|cc)\s*$", re.IGNORECASE)
FENCE_END = re.compile(r"^\s*```\s*$")
INCLUDE = re.compile(r"^\s*#\s*include\b")
# Heuristic: a line that introduces a top-level definition (so the block is NOT
# wrapped in a function). Covers `void f(`, `int main(`, class/struct/enum,
# namespace, template, using/typedef, and `constexpr T NAME =`.
TOPLEVEL = re.compile(
    r"^(?:\s*)(?:"
    r"(?:template\s*<)|"
    r"(?:namespace\b)|"
    r"(?:class\b)|(?:struct\b)|(?:enum\b)|(?:union\b)|"
    r"(?:using\b)|(?:typedef\b)|"
    r"(?:static\s+|inline\s+|constexpr\s+|extern\s+|[A-Za-z_][\w:<>,&*\s]*?\s+)"
    r"[A-Za-z_]\w*\s*\("  # a function definition/declaration
    r")"
)
DEFINE_CONST = re.compile(r"^\s*(?:static\s+|inline\s+)?constexpr\b.*=")


def extract_blocks(md_text):
    blocks, cur, in_block = [], [], False
    for line in md_text.splitlines():
        if not in_block and FENCE.match(line):
            in_block, cur = True, []
            continue
        if in_block and FENCE_END.match(line):
            blocks.append(cur)
            in_block = False
            continue
        if in_block:
            cur.append(line)
    return blocks


def is_toplevel_block(body_lines):
    for ln in body_lines:
        if INCLUDE.match(ln):
            continue
        if TOPLEVEL.match(ln) or DEFINE_CONST.match(ln):
            return True
    return False


def render_tu(md_path, blocks, rel):
    includes, parts = [], []
    seen_inc = set()
    for i, blk in enumerate(blocks):
        body = []
        for ln in blk:
            if INCLUDE.match(ln):
                key = ln.strip()
                if key not in seen_inc:
                    seen_inc.add(key)
                    includes.append(ln.rstrip())
            else:
                body.append(ln)
        # drop trailing/leading blank lines
        while body and not body[0].strip():
            body.pop(0)
        while body and not body[-1].strip():
            body.pop()
        if not body:
            continue
        # Each block lives in its OWN namespace so independent examples can
        # reuse the same symbol names (e.g. every block defines `example()`)
        # without colliding when concatenated into one TU.
        if is_toplevel_block(body):
            parts.append("namespace _doc_block_%d {\n%s\n}  // _doc_block_%d" %
                         (i, "\n".join(body), i))
        else:
            wrapped = "\n".join("  " + b for b in body)
            parts.append(
                "namespace _doc_block_%d {\nstatic void run() {\n%s\n}\n"
                "}  // _doc_block_%d" % (i, wrapped, i))
    header = (
        "// AUTO-GENERATED from %s by docs/doctest/extract.py — DO NOT EDIT.\n"
        "// Edit the example in the .md; this is a compile-only doctest fixture.\n"
        % rel)
    return header + "\n".join(includes) + "\n\n" + "\n\n".join(parts) + "\n"


def md_files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, _, files in os.walk(p):
                for f in files:
                    if f.endswith(".md"):
                        yield os.path.join(root, f)
        elif p.endswith(".md"):
            yield p


def main():
    if len(sys.argv) < 3:
        sys.exit("usage: extract.py <out_dir> <file_or_dir> ...")
    out_dir, inputs = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    n_files, n_blocks = 0, 0
    for md in sorted(md_files(inputs)):
        text = open(md, encoding="utf-8").read()
        blocks = extract_blocks(text)
        if not blocks:
            continue
        # stable, unique name from the doc path
        rel = os.path.relpath(md).replace("\\", "/")
        stem = re.sub(r"[^A-Za-z0-9]+", "_", rel[:-3]).strip("_")
        tu = render_tu(md, blocks, rel)
        out = os.path.join(out_dir, stem + ".cc")
        open(out, "w", encoding="utf-8").write(tu)
        n_files += 1
        n_blocks += len(blocks)
        print("%-70s %2d blocks -> %s" % (rel, len(blocks),
                                          os.path.basename(out)))
    print("\nextracted %d blocks from %d files into %s" %
          (n_blocks, n_files, out_dir))


if __name__ == "__main__":
    main()
