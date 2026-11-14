#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Skin Minecraft — modelo SLIM (Alex), braços de 3 px de largura.

Fusão dos 4 elementos das skins enviadas + traços do rapaz da foto:
  * índigo/roxo da túnica e gola preta      -> skins 1 e 2
  * dourado (cinto, punhos, faixa)          -> skin amarela
  * branco / prata (camisa e bota)          -> skin branca
  * pele, cabelo cacheado escuro, sobrancelhas
    grossas, barba curta e bigode           -> foto

Saída:
  skin_slim_64x64.png     textura padrão (Java / Bedrock, Slim)
  skin_slim_128x128.png   a mesma textura em 2x (HD Bedrock, Slim)

Todas as áreas não usadas pelo modelo ficam com alpha = 0.
"""

import os
from PIL import Image

# ==========================================================================
# PALETA
# ==========================================================================
PAL = {
    # cabelo / barba (castanho-escuro tirado da foto)
    "1": (21, 17, 19, 255),
    "2": (32, 26, 28, 255),
    "3": (47, 39, 42, 255),
    "4": (66, 55, 58, 255),

    # pele (medida na foto ~ #C6886B)
    "s": (198, 138, 107, 255),
    "l": (219, 161, 129, 255),
    "d": (172, 114, 88, 255),
    "D": (142, 89, 67, 255),
    "n": (156, 100, 76, 255),
    "e": (166, 106, 82, 255),

    # traços do rosto
    "w": (233, 227, 222, 255),   # esclera
    "i": (60, 34, 18, 255),      # íris castanha
    "b": (26, 20, 22, 255),      # sobrancelha grossa
    "m": (42, 31, 34, 255),      # barba / bigode
    "M": (137, 83, 73, 255),     # lábio

    # túnica índigo (cores tiradas das skins de referência)
    "P": (80, 75, 150, 255),     # #504B96
    "Q": (69, 56, 118, 255),     # #453876
    "R": (56, 38, 80, 255),      # #382650

    # preto da gola
    "K": (22, 17, 28, 255),

    # dourado (skin amarela)
    "G": (247, 197, 2, 255),     # #F7C502
    "g": (200, 170, 17, 255),    # #C8AA11

    # branco / prata (skin branca)
    "W": (230, 227, 224, 255),
    "V": (197, 193, 189, 255),
    "v": (156, 152, 148, 255),

    # calça índigo escura
    "t": (62, 44, 104, 255),     # #3E2C68
    "T": (42, 32, 44, 255),      # #2A202C
    "u": (92, 86, 162, 255),     # dobra do tecido (mais clara)

    # bota prata
    "o": (220, 219, 219, 255),   # #DCDBDB
    "O": (183, 181, 181, 255),
    "z": (52, 52, 58, 255),
}


def parse(rows, w, h, name):
    out = []
    for j, r in enumerate(rows):
        chars = list(r.replace(" ", ""))
        if len(chars) != w:
            raise ValueError("%s linha %d: %d px (esperado %d)" %
                             (name, j, len(chars), w))
        for ch in chars:
            if ch not in ". -" and ch not in PAL:
                raise ValueError("%s: caractere inválido %r" % (name, ch))
        out.append(chars)
    if len(out) != h:
        raise ValueError("%s: %d linhas (esperado %d)" % (name, len(out), h))
    return out


def paint(img, x0, y0, rows, w, h, name):
    for j, row in enumerate(parse(rows, w, h, name)):
        for i, ch in enumerate(row):
            if ch in ". -":
                continue
            img.putpixel((x0 + i, y0 + j), PAL[ch])


def mirror(rows):
    return ["".join(reversed(r.replace(" ", ""))) for r in rows]


def blank(w, h):
    return ["." * w for _ in range(h)]


# ==========================================================================
# CABEÇA — 8 x 8 por face
# ==========================================================================
# testa -> sobrancelhas grossas -> olhos castanhos -> nariz ->
# bigode -> barba curta no queixo
HEAD_FRONT = [
    "1 1 2 1 1 2 1 1",     # topo do cabelo
    "1 2 1 3 1 2 1 1",     # cabelo
    "1 2 s s s s 2 1",     # testa
    "1 b b s s b b 1",     # sobrancelhas grossas
    "1 w i s s i w 1",     # olhos castanhos
    "1 s s n n s s 1",     # nariz
    "1 m m M M m m 1",     # bigode + boca
    "1 d m m m m d 1",     # barba no queixo
]

HEAD_TOP = [
    "1 1 2 1 2 3 1 1",
    "1 2 1 3 1 2 3 1",
    "1 3 1 2 4 1 2 1",
    "2 1 2 3 2 1 3 2",
    "1 2 3 1 2 4 1 2",
    "1 1 2 4 1 3 2 1",
    "3 1 2 1 3 1 2 1",
    "1 2 1 3 2 1 3 1",
]

# lateral direita: coluna 7 = borda da frente
HEAD_RIGHT = [
    "1 1 2 1 1 2 1 1",
    "1 2 1 3 1 2 1 2",
    "1 2 1 3 1 2 1 1",
    "1 2 3 1 2 1 1 2",
    "1 2 1 1 s s s s",     # têmpora / olho
    "1 1 2 1 e e s s",     # orelha
    "1 1 1 s e e m m",
    "1 1 m m m m m m",
]

HEAD_BACK = [
    "1 1 2 1 1 2 1 1",
    "1 2 1 3 1 2 1 2",
    "1 2 3 1 2 1 3 1",
    "1 3 1 2 1 2 1 2",
    "2 1 2 3 1 2 3 1",
    "1 2 1 2 3 1 2 1",
    "3 1 3 1 2 1 2 3",
    "1 2 1 2 1 3 1 2",
]

HEAD_BOTTOM = ["D" * 8] * 8

# ---- camada extra: volume dos cachos (só o topo e as têmporas) ----
HAT_FRONT = [
    "1 1 1 1 1 1 1 1",
    "1 2 1 3 2 1 2 1",
    "1 2 . . . . 2 1",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
]

HAT_RIGHT = [
    "1 1 2 1 1 2 1 1",
    "1 2 1 3 2 1 2 1",
    "1 2 1 2 3 1 2 1",
    "1 . 2 1 2 3 2 1",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
]

HAT_BACK = [
    "1 1 2 1 1 2 1 1",
    "1 2 1 3 2 1 2 1",
    "1 2 1 2 1 3 1 2",
    "1 3 1 2 3 1 2 1",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
    ". . . . . . . .",
]

HAT_TOP = [
    "1 1 2 1 2 3 1 1",
    "1 2 1 3 1 2 3 1",
    "1 3 1 2 4 1 2 1",
    "2 1 2 3 2 1 3 2",
    "1 2 3 1 2 4 1 2",
    "1 1 2 4 1 3 2 1",
    "3 1 2 1 3 1 2 1",
    "1 2 1 3 2 1 3 1",
]

# ==========================================================================
# CORPO — 8 x 12
# ==========================================================================
BODY_FRONT = [
    "P P K s s K P P",     # gola preta + pescoço
    "P P K W W K P P",     # camisa branca sob a gola
    "Q P P K K P P Q",
    "Q P G K K G P Q",     # debrum dourado do decote
    "Q P u G G u P Q",     # dobras
    "Q P P P P P P Q",
    "Q P P G P P P Q",     # botão dourado
    "Q P P P P P P Q",
    "Q P u P P u P Q",
    "Q P P P P P P Q",
    "G G G G G G G G",     # faixa dourada
    "g g G g g G g g",     # fivela
]

BODY_BACK = [
    "K K K K K K K K",
    "R P P P P P P R",
    "R P G G G G P R",     # debrum dourado nas costas
    "R P P P P P P R",
    "R P u P P u P R",
    "Q P P P P P P Q",
    "Q P P u u P P Q",
    "Q P P P P P P Q",
    "Q P u P P u P Q",
    "Q P P P P P P Q",
    "G G G G G G G G",
    "g g g g g g g g",
]

BODY_SIDE = [                 # coluna 3 = borda frontal
    "R P K K",
    "R P K K",
    "R P G K",
    "R P P G",
    "R P P P",
    "R P u P",
    "Q P P P",
    "Q P P P",
    "Q P u P",
    "Q P P P",
    "G G G g",
    "g g g g",
]

BODY_TOP = [
    "P P R R R R P P",
    "P P R s s R P P",
    "P P R s s R P P",
    "P P R R R R P P",
]

BODY_BOTTOM = ["R" * 8] * 4

# ==========================================================================
# BRAÇOS slim — frente/costas 3 x 12, laterais 4 x 12
# ==========================================================================
ARM_FRONT = [                 # coluna 0 = borda externa
    "Q u Q",
    "Q P Q",
    "Q P Q",
    "Q u Q",
    "Q P Q",
    "Q P Q",
    "g G g",
    "l s d",
    "l s d",
    "l s d",
    "s s d",
    "d D d",
]

ARM_BACK = [
    "Q P Q",
    "Q P Q",
    "Q P Q",
    "Q P Q",
    "Q P Q",
    "Q P Q",
    "g G g",
    "l s d",
    "l s d",
    "l s d",
    "s s d",
    "d D d",
]

ARM_SIDE = [                  # coluna 3 = borda frontal
    "R P P Q",
    "R P P Q",
    "R P P Q",
    "R P P Q",
    "R P P Q",
    "R P P Q",
    "G G G g",
    "l s s d",
    "l s s d",
    "l s s d",
    "s s s d",
    "d d d D",
]

ARM_TOP = [
    "Q P Q",
    "Q P Q",
    "Q P Q",
    "Q P Q",
]

ARM_BOTTOM = [
    "d d d",
    "d d d",
    "d d D",
    "d d D",
]

# ==========================================================================
# PERNAS — 4 x 12
# ==========================================================================
LEG_FRONT = [
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T G G T",
    "o O O o",
    "O V O o",
    "z z z z",
]

LEG_BACK = [
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T G G T",
    "o o O o",
    "O O O o",
    "z z z z",
]

LEG_SIDE = [
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T t t T",
    "T G G T",
    "O o o o",
    "O O V o",
    "z z z z",
]

LEG_TOP = ["T T T T"] * 4
LEG_BOTTOM = ["z z z z"] * 4

# ==========================================================================
# MONTAGEM — mapa UV 64x64 do modelo Slim
# ==========================================================================
def build_skin():
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))

    # ---------- cabeça ----------
    paint(img, 8, 0, HEAD_TOP, 8, 8, "HEAD_TOP")
    paint(img, 16, 0, HEAD_BOTTOM, 8, 8, "HEAD_BOTTOM")
    paint(img, 0, 8, HEAD_RIGHT, 8, 8, "HEAD_RIGHT")
    paint(img, 8, 8, HEAD_FRONT, 8, 8, "HEAD_FRONT")
    paint(img, 16, 8, mirror(HEAD_RIGHT), 8, 8, "HEAD_LEFT")
    paint(img, 24, 8, HEAD_BACK, 8, 8, "HEAD_BACK")

    # ---------- camada do cabelo ----------
    paint(img, 40, 0, HAT_TOP, 8, 8, "HAT_TOP")
    paint(img, 48, 0, ["1" * 8] * 8, 8, 8, "HAT_BOTTOM")
    paint(img, 32, 8, HAT_RIGHT, 8, 8, "HAT_RIGHT")
    paint(img, 40, 8, HAT_FRONT, 8, 8, "HAT_FRONT")
    paint(img, 48, 8, mirror(HAT_RIGHT), 8, 8, "HAT_LEFT")
    paint(img, 56, 8, HAT_BACK, 8, 8, "HAT_BACK")

    # ---------- corpo ----------
    paint(img, 20, 16, BODY_TOP, 8, 4, "BODY_TOP")
    paint(img, 28, 16, BODY_BOTTOM, 8, 4, "BODY_BOTTOM")
    paint(img, 16, 20, BODY_SIDE, 4, 12, "BODY_SIDE_R")
    paint(img, 20, 20, BODY_FRONT, 8, 12, "BODY_FRONT")
    paint(img, 28, 20, mirror(BODY_SIDE), 4, 12, "BODY_SIDE_L")
    paint(img, 32, 20, BODY_BACK, 8, 12, "BODY_BACK")

    # camada da roupa: ombreiras brancas + debrum dourado
    paint(img, 20, 32, ["W W V V V V W W"] * 4, 8, 4, "JACKET_TOP")
    paint(img, 28, 32, blank(8, 4), 8, 4, "JACKET_BOTTOM")
    paint(img, 16, 36, ["V W V V"] + blank(4, 11), 4, 12, "JACKET_SIDE_R")
    paint(img, 20, 36, ["W W . . . . W W"] + blank(8, 11), 8, 12, "JACKET_FRONT")
    paint(img, 28, 36, ["W W V V"] + blank(4, 11), 4, 12, "JACKET_SIDE_L")
    paint(img, 32, 36, ["W W W W W W W W"] + blank(8, 11), 8, 12, "JACKET_BACK")

    # ---------- braço direito (slim) ----------
    paint(img, 44, 16, ARM_TOP, 3, 4, "ARM_TOP_R")
    paint(img, 47, 16, ARM_BOTTOM, 3, 4, "ARM_BOTTOM_R")
    paint(img, 40, 20, ARM_SIDE, 4, 12, "ARM_SIDE_OUT_R")
    paint(img, 44, 20, ARM_FRONT, 3, 12, "ARM_FRONT_R")
    paint(img, 47, 20, mirror(ARM_SIDE), 4, 12, "ARM_SIDE_IN_R")
    paint(img, 51, 20, ARM_BACK, 3, 12, "ARM_BACK_R")

    # ---------- braço esquerdo ----------
    paint(img, 36, 48, ARM_TOP, 3, 4, "ARM_TOP_L")
    paint(img, 39, 48, ARM_BOTTOM, 3, 4, "ARM_BOTTOM_L")
    paint(img, 32, 52, ARM_SIDE, 4, 12, "ARM_SIDE_IN_L")
    paint(img, 36, 52, ARM_FRONT, 3, 12, "ARM_FRONT_L")
    paint(img, 39, 52, mirror(ARM_SIDE), 4, 12, "ARM_SIDE_OUT_L")
    paint(img, 43, 52, ARM_BACK, 3, 12, "ARM_BACK_L")

    # ---------- perna direita ----------
    paint(img, 4, 16, LEG_TOP, 4, 4, "LEG_TOP_R")
    paint(img, 8, 16, LEG_BOTTOM, 4, 4, "LEG_BOTTOM_R")
    paint(img, 0, 20, LEG_SIDE, 4, 12, "LEG_SIDE_OUT_R")
    paint(img, 4, 20, LEG_FRONT, 4, 12, "LEG_FRONT_R")
    paint(img, 8, 20, mirror(LEG_SIDE), 4, 12, "LEG_SIDE_IN_R")
    paint(img, 12, 20, LEG_BACK, 4, 12, "LEG_BACK_R")

    # ---------- perna esquerda ----------
    paint(img, 20, 48, LEG_TOP, 4, 4, "LEG_TOP_L")
    paint(img, 24, 48, LEG_BOTTOM, 4, 4, "LEG_BOTTOM_L")
    paint(img, 16, 52, LEG_SIDE, 4, 12, "LEG_SIDE_IN_L")
    paint(img, 20, 52, LEG_FRONT, 4, 12, "LEG_FRONT_L")
    paint(img, 24, 52, mirror(LEG_SIDE), 4, 12, "LEG_SIDE_OUT_L")
    paint(img, 28, 52, LEG_BACK, 4, 12, "LEG_BACK_L")

    return img


def verificar(skin):
    """Confere se nada foi pintado fora das regiões UV do modelo Slim."""
    regioes = [
        # cabeça
        (8, 0, 8, 8), (16, 0, 8, 8), (0, 8, 8, 8), (8, 8, 8, 8),
        (16, 8, 8, 8), (24, 8, 8, 8),
        # camada do cabelo
        (40, 0, 8, 8), (48, 0, 8, 8), (32, 8, 8, 8), (40, 8, 8, 8),
        (48, 8, 8, 8), (56, 8, 8, 8),
        # corpo + camada
        (20, 16, 8, 4), (28, 16, 8, 4), (16, 20, 4, 12), (20, 20, 8, 12),
        (28, 20, 4, 12), (32, 20, 8, 12), (20, 32, 8, 4), (28, 32, 8, 4),
        (16, 36, 4, 12), (20, 36, 8, 12), (28, 36, 4, 12), (32, 36, 8, 12),
        # braço direito (slim: 3 de largura)
        (44, 16, 3, 4), (47, 16, 3, 4), (40, 20, 4, 12), (44, 20, 3, 12),
        (47, 20, 4, 12), (51, 20, 3, 12),
        # perna direita
        (4, 16, 4, 4), (8, 16, 4, 4), (0, 20, 4, 12), (4, 20, 4, 12),
        (8, 20, 4, 12), (12, 20, 4, 12),
        # braço esquerdo
        (36, 48, 3, 4), (39, 48, 3, 4), (32, 52, 4, 12), (36, 52, 3, 12),
        (39, 52, 4, 12), (43, 52, 3, 12),
        # perna esquerda
        (20, 48, 4, 4), (24, 48, 4, 4), (16, 52, 4, 12), (20, 52, 4, 12),
        (24, 52, 4, 12), (28, 52, 4, 12),
    ]
    mask = [[False] * 64 for _ in range(64)]
    for x, y, w, h in regioes:
        for j in range(y, y + h):
            for i in range(x, x + w):
                mask[j][i] = True

    fora = [(x, y) for y in range(64) for x in range(64)
            if skin.getpixel((x, y))[3] > 0 and not mask[y][x]]
    if fora:
        raise AssertionError("pixels opacos fora das regiões do modelo: %r" % fora)

    vazias = [(x, y, w, h) for x, y, w, h in regioes
              if all(skin.getpixel((i, j))[3] == 0
                     for j in range(y, y + h) for i in range(x, x + w))]
    if vazias:
        print("aviso: regiões sem pixel (ok se forem faces escondidas):", vazias)


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    skin = build_skin()
    verificar(skin)
    skin.save(os.path.join(here, "skin_slim_64x64.png"))
    skin.resize((128, 128), Image.NEAREST).save(
        os.path.join(here, "skin_slim_128x128.png"))

    previa = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    previa.alpha_composite(skin.resize((512, 512), Image.NEAREST))
    previa.save(os.path.join(here, "preview_ampliada.png"))
    print("skins geradas e verificadas")
