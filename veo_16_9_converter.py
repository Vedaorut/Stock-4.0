#!/usr/bin/env python3
"""Утилита и библиотека для подготовки изображений под формат Veo 16:9."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps


DEFAULT_PADDING = 180
DEFAULT_WIDTH = 1920
ASPECT_WIDTH = 16
ASPECT_HEIGHT = 9


class ConversionError(RuntimeError):
    """Исключение, описывающее ошибку конвертации."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Масштабирует изображение под холст 16:9 (по умолчанию 1920x1080) "
            "с белыми полями сверху и снизу."
        )
    )
    parser.add_argument(
        "input_path",
        type=Path,
        help="Путь к исходному изображению.",
    )
    parser.add_argument(
        "--padding",
        type=int,
        default=DEFAULT_PADDING,
        help=f"Отступы сверху и снизу (px). По умолчанию {DEFAULT_PADDING}.",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=DEFAULT_WIDTH,
        help=f"Ширина результирующего холста (px). По умолчанию {DEFAULT_WIDTH}.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Имя выходного PNG файла. По умолчанию '<имя>_veo.png'.",
    )
    return parser.parse_args()


def build_output_path(input_path: Path, override: Optional[Path]) -> Path:
    if override is not None:
        return override
    return input_path.with_name(f"{input_path.stem}_veo.png")


def compute_canvas_size(target_width: int) -> tuple[int, int]:
    target_height = round(target_width * ASPECT_HEIGHT / ASPECT_WIDTH)
    if target_height <= 0:
        raise ConversionError("Высота холста должна быть положительной.")
    return target_width, target_height


def validate_numeric_params(padding: int, target_width: int, target_height: int) -> None:
    if target_width <= 0:
        raise ConversionError("Ширина холста должна быть положительной.")
    if padding < 0:
        raise ConversionError("Отступ не может быть отрицательным.")
    if padding * 2 >= target_height:
        raise ConversionError("Слишком большой отступ: не остаётся места для изображения.")


def render_on_canvas(
    img: Image.Image,
    *,
    target_width: int,
    target_height: int,
    padding: int,
) -> tuple[Image.Image, int, int, float]:
    """Возвращает холст с изображением и параметры масштабирования."""

    available_height = target_height - (2 * padding)
    available_width = target_width

    if available_height <= 0 or available_width <= 0:
        raise ConversionError("Недостаточно места для изображения после применения отступов.")

    img = ImageOps.exif_transpose(img)
    source_width, source_height = img.size

    if source_width <= 0 or source_height <= 0:
        raise ConversionError("Некорректные размеры исходного изображения.")

    width_ratio = available_width / source_width
    height_ratio = available_height / source_height
    scale = min(width_ratio, height_ratio)

    if scale <= 0:
        raise ConversionError("Не удалось вычислить корректный коэффициент масштабирования.")

    resized_width = max(1, int(round(source_width * scale)))
    resized_height = max(1, int(round(source_height * scale)))
    resized_width = min(resized_width, available_width)
    resized_height = min(resized_height, available_height)

    resized = img.resize((resized_width, resized_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGB", (target_width, target_height), "white")

    offset_x = max(0, (available_width - resized_width) // 2)
    offset_y = padding + max(0, (available_height - resized_height) // 2)
    canvas.paste(resized, (offset_x, offset_y))

    return canvas, resized_width, resized_height, scale


def convert_image(
    input_path: Path,
    *,
    padding: int = DEFAULT_PADDING,
    target_width: int = DEFAULT_WIDTH,
    output_path: Optional[Path] = None,
    verbose: bool = True,
) -> Path:
    """Конвертирует изображение на диске и возвращает путь к результату."""

    input_path = Path(input_path).expanduser()
    if not input_path.exists():
        raise ConversionError(f"Файл не найден: {input_path}")

    target_width, target_height = compute_canvas_size(target_width)
    validate_numeric_params(padding, target_width, target_height)

    output_path = build_output_path(input_path, output_path).with_suffix(".png")

    if verbose:
        print(f"[info] Загружаю '{input_path}'...")

    with Image.open(input_path) as img:
        if verbose:
            print(f"[info] Размер исходника: {img.width}x{img.height} px")
        result, resized_width, resized_height, scale = render_on_canvas(
            img,
            target_width=target_width,
            target_height=target_height,
            padding=padding,
        )

    if verbose:
        print(
            f"[info] Ресайз до {resized_width}x{resized_height} px (scale {scale:.4f})."
        )
        print(
            f"[info] Сохраняю результат в '{output_path}' (PNG без сжатия)..."
        )
    result.save(output_path, format="PNG", compress_level=0)

    if verbose:
        print("[done] Готово.")
    return output_path


def main() -> int:
    args = parse_args()
    try:
        convert_image(
            args.input_path,
            padding=args.padding,
            target_width=args.width,
            output_path=args.output,
            verbose=True,
        )
    except ConversionError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
