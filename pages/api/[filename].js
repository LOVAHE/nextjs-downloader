import fs from 'fs';
import path from 'path';
import cache from 'memory-cache';

const DOWNLOAD_LIMIT = 15;
const WINDOW_SIZE_IN_HOURS = 1;
const WINDOW_SIZE_IN_MILLIS = WINDOW_SIZE_IN_HOURS * 60 * 60 * 1000;

export default (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const now = Date.now();
  let requests = cache.get(ip) || [];

  requests = requests.filter(time => now - time < WINDOW_SIZE_IN_MILLIS);

  if (requests.length >= DOWNLOAD_LIMIT) {
    res.status(429).send('Too many requests. Please try again later.');
    return;
  }

  requests.push(now);
  cache.put(ip, requests, WINDOW_SIZE_IN_MILLIS);

  const { filename } = req.query;
  const filePath = path.resolve('.', `public/files/${filename}`);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      console.error(err);
      res.status(404).end();
      return;
    }

    const range = req.headers.range;
    if (range) {
      const bytesPrefix = "bytes=";
      if (range.startsWith(bytesPrefix)) {
        const bytesRange = range.substring(bytesPrefix.length);
        const parts = bytesRange.split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;

        if (!isNaN(start) && !isNaN(end) && start >= 0 && end < stats.size && start <= end) {
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${stats.size}`,
            "Accept-Ranges": "bytes",
            "Content-Length": end - start + 1,
            "Content-Type": "application/octet-stream",
          });

          const stream = fs.createReadStream(filePath, { start, end });
          stream.pipe(res);
          return;
        }
      }
    }

    res.writeHead(200, {
      "Content-Length": stats.size,
      "Content-Type": "application/octet-stream",
    });
    fs.createReadStream(filePath).pipe(res);
  });
};
