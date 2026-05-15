/**
 * 测试 LLM 是否正常工作
 * 用法: node scripts/test-llm.mjs
 */

async function testLLM() {
  const res = await fetch("http://localhost:3017/api/glm/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "你好，请用一句话介绍一下自己。" },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("请求失败:", res.status, text);
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  console.log("=== 模型输出 ===\n");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const { event, data: state } = parsed;

        if (event === "llm.stream" && state.content) {
          // 只打印新增内容（简单方式：直接打印最后一个字符不太对）
          // 改为直接打印完整内容并用回车覆盖
          process.stdout.write(`\r内容: ${state.content}`);
        }

        if (event === "llm.done") {
          process.stdout.write("\n\n");
          console.log("=== 完成 ===");
          console.log("最终内容:", state.content);
          if (state.reasoningContent) {
            console.log("推理过程:", state.reasoningContent);
          }
          if (state.usage) {
            console.log("Token 用量:", state.usage);
          }
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  }

  reader.releaseLock();
}

testLLM().catch((err) => {
  console.error("错误:", err.message);
  process.exit(1);
});
