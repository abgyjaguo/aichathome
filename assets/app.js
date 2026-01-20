(function () {
  "use strict";

  const $ = (sel) => document.querySelector(sel);

  const fileInput = $("#fileInput");
  const loadSampleBtn = $("#loadSampleBtn");
  const searchInput = $("#searchInput");
  const toggleSystem = $("#toggleSystem");
  const toggleHidden = $("#toggleHidden");
  const leafSelect = $("#leafSelect");
  const messagesEl = $("#messages");
  const metaEl = $("#meta");
  const statusEl = $("#status");
  const subtitleEl = $("#subtitle");

  const md = window.markdownit({
    html: false,
    linkify: true,
    breaks: true,
  });

  const state = {
    fileName: null,
    conversation: null,
    leafId: null,
    showSystem: false,
    showHidden: false,
    query: "",
  };

  function setStatus(text, kind) {
    statusEl.textContent = text || "";
    statusEl.dataset.kind = kind || "";
  }

  function escapeText(text) {
    // markdown-it handles escaping for us (html:false), but we still protect input normalization.
    return (text ?? "").toString();
  }

  function epochSecondsToIso(ts) {
    if (typeof ts !== "number" || !isFinite(ts) || ts <= 0) return null;
    return new Date(ts * 1000).toISOString();
  }

  function fmtLocal(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  }

  function getRootId(mapping) {
    for (const [id, node] of Object.entries(mapping || {})) {
      if (!node || node.parent !== null) continue;
      return id;
    }
    return null;
  }

  function buildPathToLeaf(mapping, leafId) {
    const path = [];
    let current = leafId;
    const seen = new Set();
    while (current && mapping[current] && !seen.has(current)) {
      seen.add(current);
      path.push(current);
      current = mapping[current].parent;
    }
    path.reverse();
    return path;
  }

  function extractTextFromMessage(message) {
    if (!message || !message.content) return "";
    const content = message.content;
    if (content.content_type === "text" && Array.isArray(content.parts)) {
      return content.parts
        .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
        .join("\n");
    }
    if (content.parts) {
      try {
        return JSON.stringify(content.parts, null, 2);
      } catch {
        return String(content.parts);
      }
    }
    try {
      return JSON.stringify(content, null, 2);
    } catch {
      return String(content);
    }
  }

  function isHiddenNode(node) {
    return Boolean(
      node &&
        node.message &&
        node.message.metadata &&
        node.message.metadata.is_visually_hidden_from_conversation
    );
  }

  function roleClass(role) {
    if (role === "user") return "user";
    if (role === "assistant") return "assistant";
    if (role === "system") return "system";
    return "assistant";
  }

  function roleLabel(role) {
    if (role === "user") return "User";
    if (role === "assistant") return "Assistant";
    if (role === "system") return "System";
    return String(role || "Unknown");
  }

  function sanitizeLinks(container) {
    container.querySelectorAll("a[href]").forEach((a) => {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");

      try {
        const url = new URL(a.getAttribute("href"), window.location.href);
        const allowed = ["http:", "https:", "mailto:"];
        if (!allowed.includes(url.protocol)) {
          a.replaceWith(document.createTextNode(a.textContent || a.href));
        }
      } catch {
        // If URL is invalid, keep as plain text
        a.replaceWith(document.createTextNode(a.textContent || ""));
      }
    });
  }

  function applyTruncation(root) {
    root.querySelectorAll(".truncatable").forEach((wrapper) => {
      const content = wrapper.querySelector(".truncatable-content");
      const btn = wrapper.querySelector(".expand-btn");
      if (!content || !btn) return;

      const shouldTruncate = content.scrollHeight > 260;
      wrapper.classList.toggle("truncated", shouldTruncate);
      wrapper.classList.remove("expanded");
      btn.textContent = "展开";
      if (!shouldTruncate) return;

      btn.addEventListener("click", () => {
        const isTruncated = wrapper.classList.contains("truncated");
        wrapper.classList.toggle("truncated", !isTruncated);
        wrapper.classList.toggle("expanded", isTruncated);
        btn.textContent = isTruncated ? "收起" : "展开";
      });
    });
  }

  function renderMeta(conversation, fileName) {
    if (!conversation) return;
    const title = conversation.title || "(无标题)";
    const cid = conversation.conversation_id || conversation.id || "";
    const createIso = epochSecondsToIso(conversation.create_time);
    const updateIso = epochSecondsToIso(conversation.update_time);

    metaEl.innerHTML = "";
    metaEl.classList.remove("hidden");

    const grid = document.createElement("div");
    grid.className = "meta-grid";

    const items = [
      ...(fileName ? [["文件", fileName]] : []),
      ["标题", title],
      ["会话ID", cid],
      ["创建时间", createIso ? fmtLocal(createIso) : ""],
      ["更新时间", updateIso ? fmtLocal(updateIso) : ""],
    ];

    for (const [k, v] of items) {
      const div = document.createElement("div");
      div.className = "meta-item";
      div.innerHTML = `<strong>${k}：</strong> ${escapeHtml(v)}`;
      grid.appendChild(div);
    }

    metaEl.appendChild(grid);
  }

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function leafLabel(mapping, leafId) {
    const node = mapping[leafId];
    const msg = node?.message;
    const role = msg?.author?.role;
    const iso = epochSecondsToIso(msg?.create_time);
    const content = extractTextFromMessage(msg).trim();
    const preview = content ? content.slice(0, 42).replace(/\s+/g, " ") : "";
    return `${roleLabel(role)} ${iso ? fmtLocal(iso) : ""}  ${preview}`;
  }

  function renderLeafSelect(conversation) {
    const mapping = conversation?.mapping || {};
    const leaves = [];
    for (const [id, node] of Object.entries(mapping)) {
      if (!node || !node.message) continue;
      if (!Array.isArray(node.children) || node.children.length !== 0) continue;
      leaves.push(id);
    }

    leaves.sort((a, b) => {
      const ta = mapping[a]?.message?.create_time ?? 0;
      const tb = mapping[b]?.message?.create_time ?? 0;
      return ta - tb;
    });

    leafSelect.innerHTML = "";
    if (leaves.length <= 1) {
      leafSelect.classList.add("hidden");
    } else {
      leafSelect.classList.remove("hidden");
    }

    for (const leafId of leaves) {
      const opt = document.createElement("option");
      opt.value = leafId;
      opt.textContent = leafLabel(mapping, leafId);
      leafSelect.appendChild(opt);
    }

    const preferred =
      conversation.current_node && mapping[conversation.current_node]
        ? conversation.current_node
        : leaves[leaves.length - 1] || null;

    state.leafId = preferred;
    if (preferred) leafSelect.value = preferred;
  }

  function renderConversation() {
    const conversation = state.conversation;
    if (!conversation) return;
    const mapping = conversation.mapping || {};
    const leafId = state.leafId;

    if (!leafId || !mapping[leafId]) {
      setStatus("没有可展示的消息（leaf 未找到）", "warn");
      messagesEl.innerHTML = "";
      return;
    }

    const path = buildPathToLeaf(mapping, leafId);
    const rootId = getRootId(mapping);

    let nodes = path
      .map((id) => mapping[id])
      .filter((n) => n && n.message && n.message.author);

    if (!state.showHidden) nodes = nodes.filter((n) => !isHiddenNode(n));
    if (!state.showSystem)
      nodes = nodes.filter((n) => n.message.author.role !== "system");

    const q = state.query.trim().toLowerCase();
    if (q) {
      nodes = nodes.filter((n) =>
        extractTextFromMessage(n.message).toLowerCase().includes(q)
      );
    }

    messagesEl.innerHTML = "";

    if (nodes.length === 0) {
      messagesEl.innerHTML = `
        <div class="drop-hint">
          <div>没有匹配的消息。</div>
          <div style="margin-top: 8px;">
            小提示：可以清空搜索，或勾选 <span class="kbd">显示 system</span> / <span class="kbd">显示隐藏消息</span>。
          </div>
        </div>
      `;
      return;
    }

    for (const node of nodes) {
      const msg = node.message;
      const role = msg.author.role;
      const iso = epochSecondsToIso(msg.create_time);

      const wrapper = document.createElement("article");
      wrapper.className = `message ${roleClass(role)}`;
      wrapper.id = `msg-${escapeText(msg.id || "")}`;

      const header = document.createElement("div");
      header.className = "message-header";

      const roleSpan = document.createElement("div");
      roleSpan.className = "role";
      roleSpan.textContent = roleLabel(role);

      const timeEl = document.createElement("time");
      if (iso) {
        timeEl.dateTime = iso;
        timeEl.dataset.timestamp = iso;
        timeEl.textContent = fmtLocal(iso);
      } else {
        timeEl.textContent = "";
      }

      header.appendChild(roleSpan);
      header.appendChild(timeEl);

      const content = document.createElement("div");
      content.className = "message-content";

      const text = extractTextFromMessage(msg);
      const html = md.render(escapeText(text));

      const trunc = document.createElement("div");
      trunc.className = "truncatable";

      const truncContent = document.createElement("div");
      truncContent.className = "truncatable-content";
      truncContent.innerHTML = html;
      sanitizeLinks(truncContent);

      const btn = document.createElement("button");
      btn.className = "expand-btn";
      btn.type = "button";
      btn.textContent = "展开";

      trunc.appendChild(truncContent);
      trunc.appendChild(btn);
      content.appendChild(trunc);

      wrapper.appendChild(header);
      wrapper.appendChild(content);

      messagesEl.appendChild(wrapper);
    }

    applyTruncation(messagesEl);

    const title = conversation.title || "(无标题)";
    subtitleEl.textContent = `${state.fileName ? `${state.fileName} · ` : ""}${title}`;
    setStatus(
      `展示 ${nodes.length} 条消息（leaf: ${leafId}，路径节点 ${path.length}）。` +
        (q ? ` 搜索：${state.query}` : ""),
      "ok"
    );
  }

  function loadConversation(conversation, fileName) {
    if (!conversation || typeof conversation !== "object") {
      setStatus("文件不是有效的 JSON 对象", "error");
      return;
    }

    if (!conversation.mapping || typeof conversation.mapping !== "object") {
      setStatus("不支持的格式：缺少 mapping 字段（ChatGPT 导出格式）", "error");
      return;
    }

    state.conversation = conversation;
    state.fileName = fileName || null;

    renderMeta(conversation, state.fileName);
    renderLeafSelect(conversation);
    renderConversation();
  }

  async function loadSample() {
    const samplePath = "examples/sample-chatgpt-export.json";
    if (window.location.protocol === "file:") {
      setStatus(
        "浏览器在 file:// 下通常无法 fetch 同目录文件，请用“选择 JSON”或拖拽加载示例。",
        "warn"
      );
      return;
    }
    try {
      const res = await fetch(`./${encodeURI(samplePath)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const obj = JSON.parse(text);
      loadConversation(obj, samplePath);
    } catch (e) {
      setStatus(`加载示例失败：${String(e && e.message ? e.message : e)}`, "error");
    }
  }

  function bindEvents() {
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files && fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        loadConversation(obj, file.name);
      } catch (e) {
        setStatus(`解析失败：${String(e && e.message ? e.message : e)}`, "error");
      } finally {
        fileInput.value = "";
      }
    });

    loadSampleBtn.addEventListener("click", () => {
      void loadSample();
    });

    leafSelect.addEventListener("change", () => {
      state.leafId = leafSelect.value || null;
      renderConversation();
    });

    toggleSystem.addEventListener("change", () => {
      state.showSystem = Boolean(toggleSystem.checked);
      renderConversation();
    });

    toggleHidden.addEventListener("change", () => {
      state.showHidden = Boolean(toggleHidden.checked);
      renderConversation();
    });

    searchInput.addEventListener("input", () => {
      state.query = searchInput.value || "";
      renderConversation();
    });

    // Drag & drop
    const prevent = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("dragenter", prevent);
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", async (e) => {
      prevent(e);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const obj = JSON.parse(text);
        loadConversation(obj, file.name);
      } catch (err) {
        setStatus(
          `解析失败：${String(err && err.message ? err.message : err)}`,
          "error"
        );
      }
    });
  }

  function renderEmpty() {
    setStatus("支持 ChatGPT 导出 JSON（含 mapping/current_node）", "info");
    messagesEl.innerHTML = `
      <div class="drop-hint">
        <div>把对话 JSON 文件拖到这里，或点击上方 <span class="kbd">选择 JSON</span>。</div>
        <div style="margin-top: 8px;">提示：点击上方 <span class="kbd">加载示例</span> 可查看 `examples/sample-chatgpt-export.json`（需要用本地 HTTP 服务打开）。</div>
      </div>
    `;
  }

  bindEvents();
  renderEmpty();
})();
