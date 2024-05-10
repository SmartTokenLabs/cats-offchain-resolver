import dotenv from "dotenv";

dotenv.config();

export const PRIVATE_KEY = process.env.PRIVATE_KEY;
export const DATABASE_CONNECTION = process.env.DATABASE_CONNECTION; //http://scriptproxy.smarttokenlabs.com:8083
export const PORT = process.env.PORT;
export const TTL = process.env.TTL;
export const SMARTCATS_RESOLVER = "0x6a844646443f29dF2Fd47F92E3520b61F3FC0754";

if (!PRIVATE_KEY) throw new Error("No private key provided");
if (!DATABASE_CONNECTION) throw new Error("No Database link");
