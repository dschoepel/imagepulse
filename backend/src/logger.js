import pino from 'pino';
import fs from 'fs';

const streams = [{ stream: process.stdout }];

if (process.env.LOG_FILE) {
  streams.push({
    stream: fs.createWriteStream(process.env.LOG_FILE, { flags: 'a' }),
  });
}

const logger = pino(
  { level: process.env.LOG_LEVEL || 'info' },
  pino.multistream(streams),
);

export default logger;
