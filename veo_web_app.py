#!/usr/bin/env python3
"""Простое веб-приложение для конвертации изображений в формат Veo 16:9."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Optional

from flask import Flask, render_template_string, request, send_file
from PIL import Image, UnidentifiedImageError

from veo_16_9_converter import (
    DEFAULT_PADDING,
    DEFAULT_WIDTH,
    ConversionError,
    compute_canvas_size,
    render_on_canvas,
    validate_numeric_params,
)


app = Flask(__name__)


PAGE_TEMPLATE = """
<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <title>Veo 16:9 Конвертер</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 40px; background: #f5f5f5; }
      main { max-width: 520px; margin: auto; background: #fff; padding: 28px 32px; border-radius: 12px; box-shadow: 0 12px 35px rgba(23, 23, 23, 0.08); }
      h1 { font-size: 1.8rem; margin-bottom: 0.6rem; }
      form { display: grid; gap: 16px; }
      label { display: block; font-weight: 600; margin-bottom: 6px; }
      input[type="number"], input[type="file"] { width: 100%; padding: 10px; border-radius: 8px; border: 1px solid #ccc; }
      input[type="submit"] { cursor: pointer; border: none; padding: 12px 18px; border-radius: 8px; background: #3a7afe; color: #fff; font-weight: 600; }
      input[type="submit"]:hover { background: #336be0; }
      .message { padding: 14px 16px; border-radius: 8px; background: #ffe7e7; border: 1px solid #ffb3b3; color: #8a1f1f; }
      .hint { color: #666; font-size: 0.9rem; margin-top: 4px; }
    </style>
  </head>
  <body>
    <main>
      <h1>Veo 16:9 Конвертер</h1>
      <p class="hint">Загрузите изображение — на выходе получите PNG 16:9 с белыми полями, готовый для Veo 3.1.</p>
      {% if message %}
        <p class="message">{{ message }}</p>
      {% endif %}
      <form method="post" enctype="multipart/form-data">
        <div>
          <label for="image">Изображение (JPG, PNG и т.д.)</label>
          <input id="image" name="image" type="file" accept="image/*" required />
        </div>
        <div>
          <label for="padding">Высота белых полей (px)</label>
          <input id="padding" name="padding" type="number" min="0" value="{{ padding }}" />
          <p class="hint">По умолчанию {{ default_padding }} пикселей сверху и снизу.</p>
        </div>
        <div>
          <label for="width">Ширина холста (px)</label>
          <input id="width" name="width" type="number" min="16" value="{{ width }}" />
          <p class="hint">Высота вычисляется автоматически под пропорцию 16:9.</p>
        </div>
        <input type="submit" value="Конвертировать и скачать" />
      </form>
    </main>
  </body>
</html>
"""


def parse_int(value: Optional[str], *, default: int) -> int:
    if value is None or value.strip() == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ConversionError("Неверный формат числа.") from exc


@app.route("/", methods=["GET", "POST"])
def index():
    message: Optional[str] = None
    padding = DEFAULT_PADDING
    width = DEFAULT_WIDTH

    if request.method == "POST":
        file = request.files.get("image")
        padding = parse_int(request.form.get("padding"), default=DEFAULT_PADDING)
        width = parse_int(request.form.get("width"), default=DEFAULT_WIDTH)

        if not file or file.filename == "":
            message = "Пожалуйста, выберите файл изображения."
        else:
            try:
                target_width, target_height = compute_canvas_size(width)
                validate_numeric_params(padding, target_width, target_height)

                with Image.open(file.stream) as img:
                    result, _, _, _ = render_on_canvas(
                        img,
                        target_width=target_width,
                        target_height=target_height,
                        padding=padding,
                    )

                buffer = BytesIO()
                result.save(buffer, format="PNG", compress_level=0)
                buffer.seek(0)

                download_name = f"{Path(file.filename).stem or 'image'}_veo.png"
                return send_file(
                    buffer,
                    mimetype="image/png",
                    as_attachment=True,
                    download_name=download_name,
                )
            except ConversionError as exc:
                message = str(exc)
            except UnidentifiedImageError:
                message = "Не удалось распознать содержимое файла как изображение."

    return render_template_string(
        PAGE_TEMPLATE,
        message=message,
        padding=padding,
        width=width,
        default_padding=DEFAULT_PADDING,
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
