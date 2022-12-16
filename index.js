import fs from "fs";
import aws from "aws-sdk";
import utils from "util";
import path from "path";
import { config } from "dotenv";
import TelegramBot from "node-telegram-bot-api";

config();

const unlink = utils.promisify(fs.unlink);
const readFile = utils.promisify(fs.readFile);

let isBusy = false;

const uploads = {};
const downloadDir = path.resolve("./downloads");
const isProduction = process.env.NODE_ENV === "production";

const bucketName = "deluxspa-downloads";
const catalogKey = "catalog.pdf";

const bot = new TelegramBot(
  process.env.TELEGRAM_API_TOKEN,
  isProduction ? { webHook: true } : { polling: true }
);

const s3 = new aws.S3({
  region: process.env.AWS_REGION,
  endpoint: process.env.AWS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

bot.onText(/^\/link$/, async (msg) => {
  const { chat } = msg;
  const { id } = chat;

  await bot.sendMessage(
    id,
    `Адрес каталога — https://${bucketName}.storage.yandexcloud.net/${catalogKey}`
  );
});

bot.onText(/^\/upload$/, async (msg) => {
  const { chat } = msg;
  const { id } = chat;

  if (isBusy) {
    await bot.sendMessage(id, "В данный момент я уже загружаю каталог");
  } else if (uploads[id]) {
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

  isBusy = true;

  try {
    const uploadPath = await bot.downloadFile(file_id, downloadDir);

    delete uploads[id];

    const catalog = await readFile(uploadPath);

    await unlink(uploadPath);

    const { Contents } = await s3
      .listObjects({
        Bucket: bucketName,
      })
      .promise();

    if (Contents.find(({ Key }) => Key === catalogKey)) {
      await s3
        .deleteObject({
          Bucket: bucketName,
          Key: catalogKey,
        })
        .promise();
    }

    const { Location } = await s3
      .upload({
        Body: catalog,
        Bucket: bucketName,
        ContentType: "application/pdf",
        Key: catalogKey,
      })
      .promise();

    await bot.sendMessage(
      id,
      `Каталог успешно загружен и доступен по адресу ${Location}`
    );
  } finally {
    isBusy = false;
  }
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
    {
      command: "/link",
      description: "Получить ссылку на каталог",
    },
  ]);

  if (isProduction) {
    if (bot.hasOpenWebHook()) {
      await bot.closeWebHook();
    }

    console.log(
      "set webhook",
      await bot.setWebHook(
        `https://tg.deluxspa.ru/bot${process.env.TELEGRAM_API_TOKEN}`
      )
    );

    console.log("open webhook", await bot.openWebHook());

    console.log("webhook info", await bot.getWebHookInfo());
  }
}

main();
