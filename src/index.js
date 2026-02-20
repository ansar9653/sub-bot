export default {
  async fetch(request, env) {
    if (request.method === "POST") {
      try {
        const update = await request.json();
        await handleUpdate(update, env);
      } catch (e) {
        console.error("Error:", e);
      }
    }
    return new Response("OK");
  },
};

async function handleUpdate(update, env) {
  const TOKEN = env.BOT_TOKEN;

  if (update.message) {
    const chatId = update.message.chat.id;
    const text = update.message.text || "";

    if (text === "/start") {
      await sendMessage(TOKEN, chatId, "سلام! 👋\nلینک ساب را بفرست تا کانفیگ‌ها را استخراج کنم. 🚀");
      return;
    }

    if (text.startsWith("http")) {
      const waitMsg = await sendMessage(TOKEN, chatId, "⚙️ در حال استخراج کانفیگ‌ها... صبر کنید");

      const configs = await decodeSub(text);

      if (Array.isArray(configs) && configs.length > 0) {
        await env.USER_DATA.put(`user_${chatId}`, JSON.stringify(configs), { expirationTtl: 3600 });

        const buttons = [];
        const maxConfigs = Math.min(configs.length, 100);

        for (let i = 0; i < maxConfigs; i++) {
          const conf = configs[i];
          let remark = `Config ${i + 1}`;
          try {
            if (conf.includes("#")) {
              remark = decodeURIComponent(conf.split("#").pop());
            }
          } catch (e) {
            remark = conf.split("#").pop() || `Config ${i + 1}`;
          }

          const shortRemark = remark.length > 18 ? remark.substring(0, 18) + ".." : remark;
          const icon = getProtocolIcon(conf);

          buttons.push([{ text: `${icon} | ${shortRemark}`, callback_data: `conf_${i}` }]);
        }

        await deleteMessage(TOKEN, chatId, waitMsg.result.message_id);
        await sendMessage(TOKEN, chatId, `✅ ${configs.length} کانفیگ استخراج شد:\n\n🔹 روی هرکدام بزن تا کپی کنی`, { reply_markup: { inline_keyboard: buttons } });
      } else {
        await editMessage(TOKEN, chatId, waitMsg.result.message_id, `❌ خطا:\n${configs}`);
      }
    } else {
      await sendMessage(TOKEN, chatId, "❌ لطفا یک لینک ساب معتبر بفرستید.");
    }
  }

  if (update.callback_query) {
    const callbackData = update.callback_query.data;
    const chatId = update.callback_query.message.chat.id;
    const callbackId = update.callback_query.id;

    if (callbackData.startsWith("conf_")) {
      const idx = parseInt(callbackData.split("_")[1]);
      const stored = await env.USER_DATA.get(`user_${chatId}`);

      if (stored) {
        const configs = JSON.parse(stored);
        if (configs[idx]) {
          await sendMessage(TOKEN, chatId, `<code>${escapeHtml(configs[idx])}</code>`, {}, "HTML");
          await answerCallback(TOKEN, callbackId, "✅ ارسال شد");
        } else {
          await answerCallback(TOKEN, callbackId, "❌ یافت نشد");
        }
      } else {
        await answerCallback(TOKEN, callbackId, "⏰ منقضی شده، دوباره لینک بفرست");
      }
    }
  }
}

async function decodeSub(url) {
  try {
    const response = await fetch(url.trim(), {
      headers: { "User-Agent": "v2rayNG/1.8.5" },
    });
    let content = await response.text();
    content = content.trim();

    const missingPadding = content.length % 4;
    if (missingPadding) content += "=".repeat(4 - missingPadding);

    const decoded = atob(content);
    return decoded.split("\n").filter((line) => line.trim());
  } catch (e) {
    return `خطا: ${e.message}`;
  }
}

function getProtocolIcon(config) {
  if (config.startsWith("vless://")) return "🟣 VLESS";
  if (config.startsWith("vmess://")) return "🔵 VMess";
  if (config.startsWith("trojan://")) return "🔴 Trojan";
  if (config.startsWith("ss://")) return "🟡 SS";
  if (config.startsWith("hysteria")) return "🟠 Hysteria";
  if (config.startsWith("tuic://")) return "🟤 TUIC";
  return "⚪ Other";
}

function escapeHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendMessage(token, chatId, text, extra = {}, parseMode = "") {
  const body = { chat_id: chatId, text: text, ...extra };
  if (parseMode) body.parse_mode = parseMode;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function editMessage(token, chatId, messageId, text) {
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: text }),
  });
}

async function deleteMessage(token, chatId, messageId) {
  await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
  });
}

async function answerCallback(token, callbackId, text) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id: callbackId, text: text, show_alert: false }),
  });
}
