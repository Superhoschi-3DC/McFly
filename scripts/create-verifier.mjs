import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { stdin, stdout } from "node:process";
import { fileURLToPath } from "node:url";

const MIN_LENGTH = 12;
const ITERATIONS = 210000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "auth", "verifier.json");

if (process.argv.length > 2) {
  console.error("Das Passwort nicht als Argument übergeben. Eingabe über die Tastatur oder stdin.");
  process.exit(2);
}

function stripTrailingNewline(value) {
  return value.replace(/\r?\n$/, "");
}

function readHidden() {
  return new Promise(function (resolve) {
    stdout.write("Passwort: ");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    var value = "";
    function onData(chunk) {
      if (chunk === "\n" || chunk === "\r" || chunk === "\u0004") {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off("data", onData);
        stdout.write("\n");
        resolve(value);
        return;
      }
      if (chunk === "\u0003") {
        stdin.setRawMode(false);
        process.exit(1);
      }
      if (chunk === "\u007f" || chunk === "\b") {
        value = value.slice(0, -1);
        return;
      }
      if (chunk >= " " || chunk === "\t") value += chunk;
    }
    stdin.on("data", onData);
  });
}

var password = stripTrailingNewline(stdin.isTTY ? await readHidden() : readFileSync(0, "utf8")).normalize("NFC");

if (password.length < MIN_LENGTH) {
  console.error("Das Passwort muss mindestens 12 Zeichen haben.");
  process.exit(2);
}

var salt = randomBytes(16);
var digest = pbkdf2Sync(Buffer.from(password, "utf8"), salt, ITERATIONS, 32, "sha256");
mkdirSync(dirname(target), { recursive: true });
var body = {
  kdf: "PBKDF2",
  hash: "SHA-256",
  iterations: ITERATIONS,
  salt: salt.toString("base64"),
  digest: digest.toString("base64")
};
writeFileSync(target, JSON.stringify(body, null, 2) + "\n", { mode: 0o644 });
console.log("Prüfsumme geschrieben nach auth/verifier.json.");
console.log("Die Datei enthält das Passwort nicht. Erst nach einem Commit gilt sie auf GitHub Pages.");
