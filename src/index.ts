import TelegramBot, {
  Message,
  InlineKeyboardButton,
  InlineKeyboardMarkup,
} from "node-telegram-bot-api";
import mongoose from "mongoose";
import User, { IUser } from "../schemas/user";
import Channel, { IChannel } from "../schemas/mail";

const token = "";
const DB: string =
  "mongodb+srv://des1derx:qazwsx123@cluster1.5ojypah.mongodb.net/mailing?retryWrites=true&w=majority&appName=Cluster1";

mongoose
  .connect(DB)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log("MongoDB connection error:", err));

const bot = new TelegramBot(token, { polling: true });

// Combined type for user state and mail
type UserContext = {
  awaitingChannelDeletion?: number;
  state?:
    | "awaitingChannelName"
    | "awaitingChannelId"
    | "awaitingMessage"
    | "awaitingChannelLink";
  channelName?: string;
  mail?: number;
  message?: string;
  pendingMessage?: boolean;
  text?: string;
  selectedChannel?: any;
  channelId?: number;
};

const userContexts: Map<number, UserContext> = new Map();

bot.onText(/\/start/, async (msg: TelegramBot.Message) => {
  const chatId = msg.chat.id;
  const userId = msg.from?.id || 0;
  const username = msg.from?.username || "Unknown";

  try {
    const existingUser = await User.findOne({ userId });

    if (existingUser) {
      // User exists, send the keyboard with channel links
      const channels = await Channel.find(); // Fetch all channels

      if (channels.length === 0) {
        bot.sendMessage(chatId, "No channels available.");
        return;
      }

      // Create inline keyboard buttons with channel links
      const keyboard: InlineKeyboardButton[][] = channels.map((channel) => [
        { text: channel.name, url: channel.link },
      ]);

      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: keyboard,
      };

      bot.sendMessage(
        chatId,
        `Welcome back, ${username}! Here are the channels:`,
        { reply_markup: replyMarkup }
      );
    } else {
      const newUser: IUser = new User({
        userId: userId,
        username: username,
        createdAt: new Date(),
      });
      const channels = await Channel.find(); // Fetch all channels
      const keyboard: InlineKeyboardButton[][] = channels.map((channel) => [
        { text: channel.name, url: channel.link },
      ]);

      const replyMarkup: InlineKeyboardMarkup = {
        inline_keyboard: keyboard,
      };

      await newUser.save();
      bot.sendMessage(
        chatId,
        `Welcome, ${username}! Your information has been saved.`,
        { reply_markup: replyMarkup }
      );
    }
  } catch (err) {
    console.error("Error handling /start command:", err);
    bot.sendMessage(chatId, "There was an error processing your request.");
  }
});

// Handle the /addChannel command
bot.onText(/\/addChannel/, (msg: Message) => {
  const chatId = msg.chat.id;

  // Initialize user context
  userContexts.set(chatId, { state: "awaitingChannelName" });

  bot.sendMessage(chatId, "Введите имя канала - ");
});

bot.on("message", async (msg: Message) => {
  const chatId = msg.chat.id;
  const userContext = userContexts.get(chatId);

  if (userContext) {
    if (userContext.state === "awaitingChannelName") {
      const channelName = msg.text;

      if (!channelName) {
        bot.sendMessage(
          chatId,
          "Invalid channel name. Please provide a valid channel name."
        );
        return;
      }

      userContext.state = "awaitingChannelId";
      userContext.channelName = channelName;

      bot.sendMessage(chatId, "Айди канала");
    } else if (userContext.state === "awaitingChannelId") {
      const channelId = parseInt(msg.text || "", 10);

      if (isNaN(channelId)) {
        bot.sendMessage(
          chatId,
          "Invalid channel ID. Please provide a valid channel ID."
        );
        return;
      }

      userContext.state = "awaitingChannelLink";
      userContext.channelId = channelId;

      bot.sendMessage(chatId, "Ссылка на канал - ");
    } else if (userContext.state === "awaitingChannelLink") {
      const channelLink = msg.text;

      if (!channelLink || !channelLink.startsWith("http")) {
        bot.sendMessage(
          chatId,
          "Invalid channel link. Please provide a valid link."
        );
        return;
      }

      const channelId = userContext.channelId;
      const channelName = userContext.channelName;

      try {
        const existingChannel = await Channel.findOne({ channelId });

        if (existingChannel) {
          bot.sendMessage(
            chatId,
            `Channel with ID ${channelId} already exists.`
          );
        } else {
          const newChannel: IChannel = new Channel({
            name: channelName,
            channelId: channelId,
            link: channelLink, // Assuming 'link' is a field in your Channel schema
          });

          await newChannel.save();
          bot.sendMessage(
            chatId,
            `Channel '${channelName}' with ID ${channelId} and link ${channelLink} has been added.`
          );
        }

        userContexts.delete(chatId);
      } catch (err) {
        console.error("Error handling /addChannel command:", err);
        bot.sendMessage(chatId, "There was an error processing your request.");
      }
    }
  }
});

bot.on("message", async (msg: TelegramBot.Message) => {
  const chatId: number = msg.chat.id;
  const username: string | undefined = msg.chat.username;
  const mailChannels = await Channel.find();
  const users = await User.find();

  if (!userContexts.has(chatId)) {
    userContexts.set(chatId, {});
  }
  const userState = userContexts.get(chatId)!;

  if (msg.text === "/go") {
    userState.mail = 1;
    bot.sendMessage(chatId, "Введите текст для рассылки:");
  } else {
    const text: string | undefined = msg.text;
    if (text) {
      handleUserResponse(chatId, text);
    }
  }
  if (msg.text === "/deleteChannel") {
    const channels = await Channel.find();
    userState.awaitingChannelDeletion = 1;
    const channelList = channels
      .map((channel, index) => `${index} - ${channel.name}`)
      .join("\n");
    bot.sendMessage(chatId, `Выбирите канал для уделения -\n${channelList}`);
  } else {
    const text: string | undefined = msg.text;
    if (text) {
      deletionChannelResponse(chatId, text);
    }
  }
});

const deletionChannelResponse = async (chatId: number, text: string) => {
  const state = userContexts.get(chatId);
  const channels = await Channel.find();
  switch (state?.awaitingChannelDeletion) {
    case 1:
      state.awaitingChannelDeletion = 0;
      state.text = text;
      const selectedChannelIndex = parseInt(text, 10);

      if (
        isNaN(selectedChannelIndex) ||
        selectedChannelIndex < 0 ||
        selectedChannelIndex >= channels.length
      ) {
        bot.sendMessage(chatId, "Неверный выбор канала. Попробуйте снова.");
        return;
      }

      const selectedChannel = channels[selectedChannelIndex];
      state.selectedChannel = selectedChannel; // Save the selected channel in state
      const channelId = state.selectedChannel.channelId;
      bot.sendMessage(
        chatId,
        `Вы выбрали канал: ${selectedChannel.name}\n Канала удален`
      );
      await Channel.findOneAndDelete({ channelId });
  }
};

const handleUserResponse = async (chatId: number, text: string) => {
  const state = userContexts.get(chatId);
  if (!state) return; // Ensure the state exists

  try {
    const channels = await Channel.find(); // Fetch channels from the database

    switch (state.mail) {
      case 1:
        state.text = text; // Update the state text
        state.mail = 2; // Move to the next state
        state.message = text;
        // Format channels into a message with index numbers
        const channelList = channels
          .map((channel, index) => `${index} - ${channel.name}`)
          .join("\n");

        bot.sendMessage(chatId, `Выберите канал, введя номер:\n${channelList}`);
        break;

      case 2:
        const selectedChannelIndex = parseInt(text, 10);

        if (
          isNaN(selectedChannelIndex) ||
          selectedChannelIndex < 0 ||
          selectedChannelIndex >= channels.length
        ) {
          bot.sendMessage(chatId, "Неверный выбор канала. Попробуйте снова.");
          return;
        }

        const selectedChannel = channels[selectedChannelIndex];
        state.selectedChannel = selectedChannel; // Save the selected channel in state
        state.mail = 0; // Move to the next state

        bot.sendMessage(
          chatId,
          `Вы выбрали канал: ${selectedChannel.name}\nРассылка начата`
        );

        const Users = await User.find();

        const chatMembersPromises = Users.map((user) =>
          bot.getChatMember(state.selectedChannel.channelId, user.userId)
        );

        const chatMembers = await Promise.all(chatMembersPromises);

        chatMembers.forEach((member) => {
          if (
            member.status === "member" ||
            member.status === "creator" ||
            member.status === "administrator"
          ) {
            if (state.message) {
              sendMessageToUser(member.user.id, state.message);
            }
          }
        });

        break;

      default:
        break;
    }
  } catch (error) {
    bot.sendMessage(chatId, "Произошла ошибка. Попробуйте снова позже.");
    console.error("Error handling user response:", error); // Log the error for debugging
  }
};

async function sendMessageToUser(chatId: number, msg: string) {
  try {
    await bot.sendMessage(chatId, msg);
    console.log(`Message sent to user ${chatId}: ${msg}`);
  } catch (error) {
    console.error(`Failed to send message to user ${chatId}:`, error);
  }
}

// async function sendMessageToUsers(msg: string, chatId: number) {
//   const users = await User.find();

//   if (users.length === 0) {
//     await bot.sendMessage(chatId, "There are no users to broadcast to.");
//   } else {
//     for (const user of users) {
//       await bot.sendMessage(Number(user.userId), msg);
//     }
//     console.log(
//       msg,
//       users.map((user) => user.userId)
//     );
//   }
// }
