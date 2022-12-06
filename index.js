import path from "path";
import { config } from "dotenv";
import TelegramBot from "node-telegram-bot-api";

config();

const uploads = {};
const downloadDir = path.resolve("./downloads");
const isProduction = process.env.NODE_ENV === "production";

const bot = new TelegramBot(
  process.env.TELEGRAM_API_TOKEN,
  isProduction ? { webHook: true } : { polling: true }
);

bot.onText(/^\/upload$/, async (msg) => {
  const { chat } = msg;
  const { id } = chat;

  if (uploads[id]) {
    await bot.sendMessage(id, "Я все еще жду файла");
  } else {
    uploads[id] = {
      chat,
    };

    await bot.sendMessage(id, "Теперь отправь pdf каталог");
  }
});

bot.on("document", async (msg) => {
  const { chat, document } = msg;
  const { id } = chat;

  if (!uploads[id]) {
    return bot.sendMessage(id, "Извините, но не надо мне слать ваши файлы");
  }

  const { file_id, mime_type } = document;

  if (mime_type !== "application/pdf") {
    return bot.sendMessage(id, "Нужно прислать именно pdf");
  }

  const uploadPath = await bot.downloadFile(file_id, downloadDir);

  delete uploads[id];

  await bot.sendMessage(
    id,
    `Каталог загружен и доступен по адресу https://tg.deluxspa.ru/downloads/${path.basename(
      uploadPath
    )}`
  );
});

bot.on("error", (error) => {
  console.log("Bot error", error);
});

bot.on("webhook_error", (error) => {
  console.log("Webhook error", error);
});

async function main() {
  await bot.setMyCommands([
    {
      command: "/upload",
      description: "Загрузить каталог NEON BEARD",
    },
  ]);

  if (isProduction) {
    if (bot.hasOpenWebHook()) {
      await bot.closeWebHook();
    }

    console.log("set webhook", await bot.setWebHook("https://tg.deluxspa.ru"));

    console.log("open webhook", await bot.openWebHook());
  }
}

main();
