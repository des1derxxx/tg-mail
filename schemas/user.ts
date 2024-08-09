import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  userId: number;
  username: string;
  createdAt: Date;
}

const userSchema = new Schema({
  userId: { type: Number, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model<IUser>("User", userSchema);

export default User;
