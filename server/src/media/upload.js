/**
 * Модуль загрузки медиафайлов
 * Настройка multer для безопасной загрузки
 */

const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const config = require('../config');
const logger = require('../utils/logger');

// Убеждаемся, что директория загрузки существует
const uploadDir = config.media.uploadDir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  logger.info('Создана директория медиахранилища', { path: uploadDir });
}

// Настройка хранения файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Генерируем уникальное имя файла для предотвращения коллизий
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// Фильтр файлов по MIME-типу
const fileFilter = (req, file, cb) => {
  if (config.media.allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    logger.warn('Отклонён файл с недопустимым MIME-типом', {
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
    cb(new Error(`Недопустимый тип файла: ${file.mimetype}`), false);
  }
};

// Экземпляр multer для загрузки
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.media.maxFileSize,
    files: 1, // одна загрузка за раз
  },
});

/**
 * Получение списка файлов в хранилище
 * @returns {Array} — список файлов с метаданными
 */
function listMedia() {
  try {
    const files = fs.readdirSync(uploadDir);
    return files
      .filter((f) => f !== '.gitkeep')
      .map((filename) => {
        const filePath = path.join(uploadDir, filename);
        const stats = fs.statSync(filePath);
        return {
          filename,
          size: stats.size,
          createdAt: stats.birthtime,
          url: `/media/${filename}`,
        };
      });
  } catch (err) {
    logger.error('Ошибка получения списка медиа', { error: err.message });
    return [];
  }
}

/**
 * Удаление файла из хранилища
 * @param {string} filename — имя файла для удаления
 * @returns {boolean} — успешность операции
 */
function deleteMedia(filename) {
  // Защита от path traversal
  const safeName = path.basename(filename);
  const filePath = path.join(uploadDir, safeName);

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      logger.info('Файл удалён', { filename: safeName });
      return true;
    }
    return false;
  } catch (err) {
    logger.error('Ошибка удаления файла', { filename: safeName, error: err.message });
    return false;
  }
}

module.exports = { upload, listMedia, deleteMedia };
