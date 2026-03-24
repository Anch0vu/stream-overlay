/**
 * Маршруты управления медиаконтентом
 * Загрузка, список, удаление файлов
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const { authMiddleware, moderatorOrStreamer, streamerOnly } = require('../auth/middleware');
const { upload, listMedia, deleteMedia } = require('../media/upload');
const { validateUploadedFile, validateExternalUrl } = require('../media/validation');
const { uploadLimiter } = require('../utils/rate-limit');
const logger = require('../utils/logger');

/**
 * POST /api/media/upload
 * Загрузка медиафайла (стример или модератор)
 */
router.post(
  '/upload',
  authMiddleware,
  moderatorOrStreamer,
  uploadLimiter,
  upload.single('file'),
  (req, res) => {
    // Валидация загруженного файла
    const validation = validateUploadedFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    logger.info('Файл загружен', {
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      user: req.user.id,
    });

    res.json({
      filename: req.file.filename,
      originalname: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: `/media/${req.file.filename}`,
    });
  }
);

/**
 * POST /api/media/external
 * Добавление внешней ссылки на медиа (с проверкой на SSRF)
 */
router.post('/external', authMiddleware, moderatorOrStreamer, (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL не указан' });
  }

  // Проверка URL на SSRF
  const validation = validateExternalUrl(url);
  if (!validation.safe) {
    return res.status(400).json({ error: validation.reason });
  }

  logger.info('Внешняя ссылка добавлена', { url, user: req.user.id });

  res.json({
    type: 'external',
    url,
  });
});

/**
 * GET /api/media/list
 * Получение списка загруженных файлов
 */
router.get('/list', authMiddleware, moderatorOrStreamer, (req, res) => {
  const files = listMedia();
  res.json(files);
});

/**
 * DELETE /api/media/:filename
 * Удаление файла (только стример)
 */
router.delete('/:filename', authMiddleware, streamerOnly, (req, res) => {
  // Санитизация имени файла (защита от path traversal)
  const filename = path.basename(req.params.filename);

  const deleted = deleteMedia(filename);
  if (deleted) {
    res.json({ message: 'Файл удалён' });
  } else {
    res.status(404).json({ error: 'Файл не найден' });
  }
});

module.exports = router;
