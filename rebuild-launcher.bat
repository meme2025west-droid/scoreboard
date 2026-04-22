@echo off
setlocal
cd /d "%~dp0"

echo Generating icon from favicon.svg...
node -e "
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgBuf = fs.readFileSync(path.join('client', 'public', 'favicon.svg'));

async function buildIco(sizes) {
  const images = await Promise.all(sizes.map(async size => {
    const buf = await sharp(svgBuf, { density: 384 })
      .resize(size, size)
      .png()
      .toBuffer();
    return { size, buf };
  }));
  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dataOffset = headerSize + count * dirEntrySize;
  let offset = dataOffset;
  const dirs = images.map(img => { const d = { ...img, offset }; offset += img.buf.length; return d; });
  const out = Buffer.alloc(offset);
  out.writeUInt16LE(0, 0); out.writeUInt16LE(1, 2); out.writeUInt16LE(count, 4);
  dirs.forEach((img, i) => {
    const b = headerSize + i * dirEntrySize;
    out.writeUInt8(img.size >= 256 ? 0 : img.size, b);
    out.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1);
    out.writeUInt8(0, b + 2); out.writeUInt8(0, b + 3);
    out.writeUInt16LE(1, b + 4); out.writeUInt16LE(32, b + 6);
    out.writeUInt32LE(img.buf.length, b + 8);
    out.writeUInt32LE(img.offset, b + 12);
  });
  dirs.forEach(img => img.buf.copy(out, img.offset));
  return out;
}

buildIco([16, 32, 48, 256]).then(buf => {
  const dest = path.join('tools', 'start-desktop-launcher', 'icon.ico');
  fs.writeFileSync(dest, buf);
  console.log('icon.ico written (' + buf.length + ' bytes)');
});
"

if errorlevel 1 (
  echo Icon generation failed. Make sure "sharp" is installed: npm install --no-save sharp
  exit /b 1
)

echo Publishing launcher...
cd tools\start-desktop-launcher
dotnet publish -c Release -r win-x64 --self-contained true /p:PublishSingleFile=true -o publish

if errorlevel 1 (
  echo Launcher publish failed.
  exit /b 1
)

cd /d "%~dp0"
copy /y "tools\start-desktop-launcher\publish\startScorecard.exe" "startScorecard.exe"

echo.
echo Done. startScorecard.exe updated with latest icon.
