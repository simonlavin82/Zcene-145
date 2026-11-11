import { scrapeImageUrlBackend } from "../functions/src/services/curatorService";
import { config } from "dotenv";
config();
async function run() {
  const url = await scrapeImageUrlBackend("Spaced", "artist", "Hardcore Punk", "Spaced is a hardcore punk band...");
  console.log("Result:", url);
}
run();
