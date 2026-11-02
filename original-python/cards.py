import random


CARDS = [
    {
        "name": "방어막",
        "description": "다음 한 번의 게임 내 피해를 방지한다.",
        "type": "defense",
        "effect": "shield"
    },
    {
        "name": "행운",
        "description": "이번 턴의 가상 생존 판정에 유리한 보정을 받는다.",
        "type": "special",
        "effect": "luck"
    },
    {
        "name": "정찰",
        "description": "현재 게임의 가상 위험 수치를 확인한다.",
        "type": "information",
        "effect": "scout"
    },
    {
        "name": "회복",
        "description": "목숨을 1 회복한다. 최대 목숨을 넘을 수 없다.",
        "type": "defense",
        "effect": "heal"
    },
    {
        "name": "방해",
        "description": "다음 플레이어의 행동을 한 번 건너뛰게 한다.",
        "type": "attack",
        "effect": "skip"
    },
    {
        "name": "보호",
        "description": "이번 턴의 가상 생존 판정에 실패해도 피해를 받지 않는다.",
        "type": "defense",
        "effect": "protect"
    },
]


def draw_card():
    """무작위 카드 한 장을 생성한다."""
    return random.choice(CARDS).copy()


def get_cards():
    """전체 카드 목록을 반환한다."""
    return CARDS