import { mkdir, writeFile } from "node:fs/promises";
const destination = new URL("../public/posters/", import.meta.url);
await mkdir(destination, { recursive: true });
const films = [
  ["THE LAST", "HORIZON", "#23333c", "#d5aa71", "A JOURNEY BEYOND THE KNOWN"],
  ["MIDNIGHT", "EXPRESS", "#28243b", "#d7986c", "EVERY DEPARTURE HAS A STORY"],
  ["THE SILENT", "TIDE", "#143b44", "#91c7c6", "SOME SECRETS RUN DEEP"],
  ["AFTER", "THE RAIN", "#223b2f", "#d3c78a", "BEGIN AGAIN"],
  ["ORBIT", "NINE", "#202240", "#c1a7da", "HOME IS A DISTANT LIGHT"],
  ["GOLDEN", "HOUR", "#57372f", "#e8b576", "ONE CITY. A THOUSAND DREAMS."],
];
const art = [
  '<circle cx="200" cy="205" r="100" fill="url(#sun)"/><path d="M0 350 130 215 205 310 280 235 400 360V600H0" fill="#152329"/><path d="M0 390 160 325 400 385V600H0" fill="#0e1a20"/><path d="M170 600 195 340 205 340 235 600" fill="#998465" opacity=".5"/><path d="M196 380h9v32h-9z" fill="#080e14"/>',
  '<circle cx="300" cy="140" r="52" fill="url(#sun)"/><path d="M0 170 90 250V600H0M400 130 320 230V600H400" fill="#131322"/><path d="M75 380 200 230 325 380V600H75" fill="#19192b"/><rect x="137" y="266" width="126" height="150" rx="30" fill="#614a4a"/><rect x="148" y="280" width="104" height="60" rx="10" fill="#b78f6e"/><circle cx="159" cy="382" r="11" fill="#f9d6a0"/><circle cx="241" cy="382" r="11" fill="#f9d6a0"/><path d="m150 420-70 180m170-180 70 180" stroke="#b69c8d" stroke-width="5"/>',
  '<circle cx="270" cy="170" r="60" fill="url(#sun)"/><path d="M0 300Q100 260 200 300T400 300V600H0" fill="#10303a"/><path d="M0 350Q120 300 220 350T400 350M0 400Q120 350 220 400T400 400M0 450Q120 400 220 450T400 450" fill="none" stroke="#548a90" stroke-width="3"/><path d="M125 300h160l-40 35h-90z" fill="#0b2129"/><path d="M196 300V200l55 83h-55" fill="#a3b8ad"/>',
  '<circle cx="235" cy="190" r="80" fill="url(#sun)"/><path d="M0 360Q90 230 180 320T400 300V600H0" fill="#193c2b"/><path d="M0 430Q120 300 250 390T400 400V600H0" fill="#102c21"/><path d="M165 600Q250 450 190 350" stroke="#c1b487" stroke-width="20" fill="none"/><path d="M70 300V160m0 80-35-40m35 10 40-40M330 350V130m0 100-35-40m35 15 40-40" stroke="#112b22" stroke-width="12"/>',
  '<circle cx="230" cy="240" r="100" fill="url(#sun)"/><ellipse cx="230" cy="240" rx="170" ry="38" transform="rotate(-30 230 240)" fill="none" stroke="#aaa3c9" stroke-width="14"/><circle cx="80" cy="130" r="3" fill="white"/><circle cx="340" cy="85" r="2" fill="white"/><circle cx="310" cy="380" r="3" fill="white"/><path d="M0 450Q200 345 400 470V600H0" fill="#111327"/><path d="M184 400v58h30v-58q-15-20-30 0" fill="#b7a7bb"/><circle cx="199" cy="394" r="17" fill="#41445d"/>',
  '<circle cx="200" cy="220" r="110" fill="url(#sun)"/><path d="M0 400V290h35v-55h38v150h30V250h45V180h30v205h35V260h38v-40h50v165h30V265h40v135h29V600H0" fill="#382c30"/><path d="M0 460V350h60v80h60V320h50v110h80V340h60v90h90V600H0" fill="#211d26"/><g fill="#d3a278"><path d="M128 340h8v12h-8zm20 0h8v12h-8zm-20 25h8v12h-8zm20 0h8v12h-8zM262 365h8v12h-8zm20 0h8v12h-8z"/></g>',
];
for (let i = 0; i < films.length; i++) {
  const [a, b, bg, accent, tag] = films[i];
  await writeFile(
    new URL(i + ".svg", destination),
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 600"><defs><linearGradient id="bg" x2="0" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="#111319"/></linearGradient><radialGradient id="sun"><stop stop-color="${accent}"/><stop offset="1" stop-color="${accent}" stop-opacity=".45"/></radialGradient><linearGradient id="shade" x2="0" y2="1"><stop stop-opacity="0"/><stop offset="1" stop-color="#080a0e"/></linearGradient></defs><rect width="400" height="600" fill="url(#bg)"/><text x="200" y="40" fill="#fff" opacity=".65" text-anchor="middle" font-family="sans-serif" font-size="10" letter-spacing="5">FRAME ORIGINAL STORIES</text>${art[i]}<rect y="385" width="400" height="215" fill="url(#shade)"/><text x="200" y="485" fill="#f6eadc" text-anchor="middle" font-family="Georgia,serif" font-size="35" letter-spacing="3">${a}</text><text x="200" y="528" fill="#f6eadc" text-anchor="middle" font-family="Georgia,serif" font-size="39" letter-spacing="3">${b}</text><text x="200" y="563" fill="${accent}" text-anchor="middle" font-family="sans-serif" font-size="8" letter-spacing="2">${tag}</text><path d="M165 581h70" stroke="${accent}" opacity=".4"/></svg>`,
  );
}
