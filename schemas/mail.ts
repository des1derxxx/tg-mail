// models/Channel.ts

import mongoose, { Schema, Document } from "mongoose";

// Определение интерфейса для документа канала
export interface IChannel extends Document {
  name: string;
  channelId: number;
  link: string;
}

// Определение схемы
const channelSchema = new Schema({
  name: { type: String, required: true },
  channelId: { type: Number, required: true, unique: true },
  link: { type: String, required: true },
});

// Создание модели
const Channel = mongoose.model<IChannel>("Channel", channelSchema);

export default Channel;
