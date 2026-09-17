/**
 * dsh-plugin-diff-visible — client bundle.
 *
 * Registers keyed `tool.call.toolview` entries for `write` and `edit` at a
 * lower priority than the built-in file-mutation row, so this row SHADOWS the
 * built-in one. Two behavioral differences from the built-in:
 *   1. the diff card is expanded by default (no click to reveal), and
 *   2. when the filesystem tool attached hunk line numbers (oldStart/newStart
 *      plus interleaved `rows`), the diff renders as a git-style unified diff
 *      with line-number gutters, `@@` headers, and red/green +/- lines.
 * Falls back to the shared DiffBlock when a diff carries no line numbers
 * (running calls and replayed older sessions).
 */
window.__ModuleLoader__.load({
  id: "dsh-plugin-diff-visible",
  factory: (require) => {
    const React = require("react");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");
    const { DiffBlock, DisclosureRow, IconEditOutline16, StateDot } = primitives;

    // Chrome CSS (summary / separator / file-link) plus the line-numbered
    // unified-diff surface. DisclosureRow/DiffBlock/StateDot styling ships
    // with the shell's stylesheet.
    const css = [
      ".dshdv_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}",
      ".dshdv_summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;color:var(--dsw-alias-label-tertiary);flex:auto;font-size:14px;line-height:24px;overflow:hidden}",
      ".dshdv_summary.dshdv_error{color:var(--dsw-alias-state-error-primary)}",
      ".dshdv_fileLink{text-overflow:ellipsis;white-space:nowrap;min-width:0;font:inherit;text-align:left;color:var(--dsw-alias-label-secondary);text-decoration:underline;text-decoration-color:var(--dsw-alias-label-quaternary);text-underline-offset:3px;cursor:pointer;background:0 0;border:none;flex:auto;margin:0;padding:0;font-size:14px;line-height:24px;overflow:hidden}",
      ".dshdv_fileLink:hover{color:var(--dsw-alias-label-primary);text-decoration-color:currentColor}",
      ".dshdv_body{margin:2px 0 2px 22px}",
      ".dshdv_diff{font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;background:var(--dsw-alias-markdown-code-block);border-radius:8px;padding:6px 0 2px;overflow:auto}",
      ".dshdv_path{color:var(--dsw-alias-label-secondary);font-weight:600;padding:2px 12px}",
      ".dshdv_hunk{color:var(--dsw-alias-state-business-primary);padding:2px 12px}",
      ".dshdv_line{display:flex;gap:8px;padding:0 12px;white-space:pre}",
      ".dshdv_ln{flex:none;width:32px;text-align:right;color:var(--dsw-alias-label-caption);user-select:none}",
      ".dshdv_sign{flex:none;width:12px;text-align:center}",
      ".dshdv_text{white-space:pre-wrap;word-break:break-word;min-width:0}",
      ".dshdv_add{background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 10%, transparent);color:var(--dsw-alias-state-success-primary)}",
      ".dshdv_add .dshdv_ln,.dshdv_add .dshdv_sign{color:inherit}",
      ".dshdv_del{background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 10%, transparent);color:var(--dsw-alias-state-error-primary)}",
      ".dshdv_del .dshdv_ln,.dshdv_del .dshdv_sign{color:inherit}",
      ".dshdv_ctx{color:var(--dsw-alias-label-secondary)}",
      ".dshdv_expand{width:100%;background:0 0;border:none;cursor:pointer;text-align:left;color:var(--dsw-alias-label-secondary);font:inherit;padding:2px 12px}",
      ".dshdv_expand:hover{color:var(--dsw-alias-label-primary)}",
      ".dshdv_footer{color:var(--dsw-alias-label-caption);padding:2px 12px 4px;font-size:11px}"
    ].join("\n");
    const tagId = "dsh-plugin-diff-visible/DiffVisibleRow.module.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "dsh-plugin-diff-visible";
      tag.dataset.pluginCss = tagId;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    function parseArgs(argsRaw) {
      try {
        return JSON.parse(argsRaw);
      } catch {
        return undefined;
      }
    }

    function firstLine(text) {
      const nl = text.indexOf("\n");
      return nl === -1 ? text : text.slice(0, nl);
    }

    function relativize(text, cwd) {
      if (!cwd) return text;
      const root = String(cwd).replace(/[/\\]+$/, "");
      if (text.startsWith(root + "/") || text.startsWith(root + "\\")) return text.slice(root.length + 1);
      return text;
    }

    function pickPath(argsRaw) {
      const parsed = parseArgs(argsRaw);
      if (typeof parsed !== "object" || parsed === null) return undefined;
      const p = parsed.file_path ?? parsed.path;
      return typeof p === "string" && p !== "" ? firstLine(p) : undefined;
    }

    function resultText(node) {
      const parts = [];
      for (const block of node.content) {
        if (block.type === "text") parts.push(block.text);
        else parts.push(JSON.stringify(block, null, 2));
      }
      if (parts.length === 0 && node.error !== undefined) parts.push(node.error.name + ": " + node.error.code);
      return parts.join("\n");
    }

    // Validate wire `diffs` so a malformed hunk falls back to null instead of
    // crashing the renderer (same guard posture the built-in uses). Carries
    // the optional hunk line numbers and interleaved `rows` when present.
    function narrowDiffs(diffs) {
      if (!Array.isArray(diffs) || diffs.length === 0) return null;
      const out = [];
      for (const hunk of diffs) {
        if (typeof hunk !== "object" || hunk === null) return null;
        const { path, oldText, newText } = hunk;
        if (typeof path !== "string") return null;
        if (oldText !== null && typeof oldText !== "string") return null;
        if (typeof newText !== "string") return null;
        const item = { path, oldText, newText };
        if (typeof hunk.oldStart === "number") item.oldStart = hunk.oldStart;
        if (typeof hunk.newStart === "number") item.newStart = hunk.newStart;
        if (typeof hunk.oldLines === "number") item.oldLines = hunk.oldLines;
        if (typeof hunk.newLines === "number") item.newLines = hunk.newLines;
        if (Array.isArray(hunk.rows)) {
          const rows = [];
          for (const r of hunk.rows) {
            if (typeof r !== "object" || r === null) return null;
            if (r.type !== "ctx" && r.type !== "del" && r.type !== "add") return null;
            if (typeof r.text !== "string") return null;
            rows.push({
              type: r.type,
              oldLine: typeof r.oldLine === "number" ? r.oldLine : null,
              newLine: typeof r.newLine === "number" ? r.newLine : null,
              text: r.text
            });
          }
          item.rows = rows;
        }
        out.push(item);
      }
      return out;
    }

    // Derive the diff card for a running or settled call, mirroring the
    // built-in diffCardModel: result-side wins once the call settles.
    function diffModel(block) {
      if (!("kind" in block)) {
        const call = block.callView?.card === "diff" ? block.callView : null;
        const diffs = call === null ? null : narrowDiffs(call.diffs);
        return diffs === null ? null : { diffs };
      }
      const result = block.resultView?.card === "diff" ? block.resultView : null;
      const diffs = result === null ? null : narrowDiffs(result.diffs);
      return diffs === null ? null : { diffs };
    }

    function renderDiffRow(row, key) {
      if (row.kind === "path") {
        return React.createElement("div", { key, className: "dshdv_path" }, row.text);
      }
      if (row.kind === "hunk") {
        return React.createElement("div", { key, className: "dshdv_hunk" }, row.text);
      }
      const cls = "dshdv_line " + (row.type === "add" ? "dshdv_add" : row.type === "del" ? "dshdv_del" : "dshdv_ctx");
      const sign = row.type === "add" ? "+" : row.type === "del" ? "-" : " ";
      return React.createElement(
        "div",
        { key, className: cls },
        React.createElement("span", { className: "dshdv_ln" }, row.oldLine != null ? String(row.oldLine) : ""),
        React.createElement("span", { className: "dshdv_ln" }, row.newLine != null ? String(row.newLine) : ""),
        React.createElement("span", { className: "dshdv_sign" }, sign),
        React.createElement("span", { className: "dshdv_text" }, row.text)
      );
    }

    // Git-style unified diff with line-number gutters, `@@` range headers,
    // red/green +/- lines, and a head/tail cap with "… 其余 N 行" toggle.
    function LineDiff({ diffs }) {
      const { rows, added, removed, files } = React.useMemo(() => {
        const rows = [];
        let added = 0;
        let removed = 0;
        const paths = new Set();
        let prevPath;
        for (const d of diffs) {
          paths.add(d.path);
          if (d.path !== prevPath) {
            rows.push({ kind: "path", text: d.path });
            prevPath = d.path;
          }
          const hasRange = typeof d.oldStart === "number" && typeof d.newStart === "number"
            && typeof d.oldLines === "number" && typeof d.newLines === "number";
          if (hasRange) {
            rows.push({ kind: "hunk", text: "@@ -" + d.oldStart + "," + d.oldLines + " +" + d.newStart + "," + d.newLines + " @@" });
          }
          for (const r of d.rows ?? []) {
            if (r.type === "add") added++;
            else if (r.type === "del") removed++;
            rows.push({ kind: "line", type: r.type, oldLine: r.oldLine, newLine: r.newLine, text: r.text });
          }
        }
        return { rows, added, removed, files: paths.size };
      }, [diffs]);

      const [expanded, setExpanded] = React.useState(false);
      const maxLines = 24;
      const hidden = rows.length - maxLines;
      const capped = hidden > 0 && !expanded;
      const headLines = Math.ceil(maxLines / 2);
      const tailLines = maxLines - headLines;
      const head = capped ? rows.slice(0, headLines) : rows;
      const tail = capped ? rows.slice(rows.length - tailLines) : [];

      return React.createElement(
        "div",
        { className: "dshdv_diff" },
        head.map((row, i) => renderDiffRow(row, i)),
        hidden > 0 && React.createElement("button", {
          type: "button",
          className: "dshdv_expand",
          "aria-expanded": expanded,
          onClick: () => setExpanded((v) => !v),
          children: expanded ? "收起" : "… 其余 " + hidden + " 行"
        }),
        tail.map((row, i) => renderDiffRow(row, head.length + i)),
        React.createElement("div", { className: "dshdv_footer" },
          "└ +" + added + " -" + removed + " · " + files + (files === 1 ? " file" : " files"))
      );
    }

    function DiffVisibleRow(props) {
      const { toolName, block, cwd, openFile } = props;
      const done = "kind" in block;
      const argsRaw = (done ? block.call?.argsRaw : block.argsRaw) ?? "";
      const state = !done
        ? "running"
        : block.error?.code === "interrupted"
          ? "stopped"
          : block.isError
            ? "error"
            : "ok";
      const filePath = pickPath(argsRaw);
      const summary = filePath !== undefined ? relativize(filePath, cwd) : (argsRaw === "" ? block.callId : "");
      const title = toolName === "write" ? "Write" : "Edit";
      const output = done ? resultText(block) || null : null;
      const errorSummary = state === "error" && output !== null ? firstLine(output) : null;
      const diff = diffModel(block);

      const [expanded, setExpanded] = React.useState(true);
      const expandable = diff !== null;
      const open = expanded && expandable;

      const icon = state === "error"
        ? React.createElement(StateDot, { state: "error" })
        : state === "stopped"
          ? React.createElement(StateDot, { state: "warning" })
          : React.createElement(IconEditOutline16, { size: 14 });

      const failureLine = state === "error" ? errorSummary ?? null : null;
      const summaryText = failureLine ?? summary;
      const hasLink = filePath !== undefined && openFile !== undefined && failureLine === null;

      const collapsedContent = summaryText !== ""
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement("span", { className: "dshdv_sep", "aria-hidden": true }),
            hasLink
              ? React.createElement("button", {
                  type: "button",
                  className: "dshdv_fileLink",
                  onClick: (event) => {
                    event.stopPropagation();
                    openFile(filePath);
                  },
                  children: summaryText
                })
              : React.createElement("span", {
                  className: "dshdv_summary" + (failureLine !== null ? " dshdv_error" : ""),
                  children: summaryText
                })
          )
        : null;

      const hasRows = diff !== null && diff.diffs.some((d) => Array.isArray(d.rows) && d.rows.length > 0);
      const children = diff !== null
        ? React.createElement(
            "div",
            { className: "dshdv_body" },
            hasRows
              ? React.createElement(LineDiff, { diffs: diff.diffs })
              : React.createElement(DiffBlock, {
                  diffs: diff.diffs.map(({ path, oldText, newText }) => ({ path, oldText, newText }))
                })
          )
        : null;

      return React.createElement(DisclosureRow, {
        icon,
        title,
        open,
        expandable,
        onToggle: () => setExpanded((value) => !value),
        expandOnRowClick: true,
        keepContentWhenOpen: true,
        collapsedContent,
        children
      });
    }

    function apply(ctx) {
      ctx.slots.inject("tool.call.toolview", function* () {
        yield ctx.slots.register(
          { name: "tool.call.toolview", key: "edit", priority: -10 },
          DiffVisibleRow
        );
        yield ctx.slots.register(
          { name: "tool.call.toolview", key: "write", priority: -10 },
          DiffVisibleRow
        );
      });
    }

    return { apply, inject: ["slots"] };
  }
});
