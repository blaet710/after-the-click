import random
from cards import draw_card


MAX_HP = 3


class Player:
    def __init__(self, name):
        self.name = name
        self.hp = MAX_HP
        self.cards = []
        self.alive = True
        self.shield = False
        self.protected = False
        self.lucky = False
        self.skip_next_turn = False

    def receive_card(self):
        card = draw_card()
        self.cards.append(card)
        print(f"{self.name}에게 [{card['name']}] 카드가 지급되었습니다.")

    def show_status(self):
        print(f"\n[{self.name}] 목숨: {self.hp}/{MAX_HP}")
        print("보유 카드:")

        if not self.cards:
            print("  없음")
        else:
            for index, card in enumerate(self.cards, start=1):
                print(
                    f"  {index}. {card['name']} - "
                    f"{card['description']}"
                )


class Game:
    def __init__(self, player_names):
        self.players = [Player(name) for name in player_names]
        self.cycle = 1
        self.current_index = 0

        # 게임 내부에서만 사용하는 가상 위험 수치.
        # 실제 무기나 탄창을 모델링하지 않는다.
        self.danger = random.randint(20, 50)

        for player in self.players:
            player.receive_card()

    def alive_players(self):
        return [p for p in self.players if p.alive]

    def show_all_status(self):
        print("\n" + "=" * 40)
        print(f"사이클 {self.cycle}")
        print("=" * 40)

        for player in self.players:
            if player.alive:
                player.show_status()
            else:
                print(f"\n[{player.name}] 탈락")

    def use_card(self, player):
        if not player.cards:
            print("사용할 카드가 없습니다.")
            return

        player.show_status()

        try:
            choice = input(
                "\n사용할 카드 번호를 입력하세요 "
                "(사용하지 않으려면 0): "
            )

            index = int(choice)

        except ValueError:
            print("숫자를 입력해 주세요.")
            return

        if index == 0:
            print("카드를 사용하지 않았습니다.")
            return

        if not 1 <= index <= len(player.cards):
            print("잘못된 카드 번호입니다.")
            return

        card = player.cards[index - 1]
        effect = card["effect"]

        # 효과를 발동할 수 없는 경우에는 카드를 소모하지 않는다.
        if effect == "heal" and player.hp >= MAX_HP:
            print("목숨이 이미 최대치입니다. 카드를 사용할 수 없습니다.")
            return

        if effect == "shield" and player.shield:
            print("이미 방어막이 활성화되어 있습니다.")
            return

        if effect == "protect" and player.protected:
            print("이미 보호 효과가 활성화되어 있습니다.")
            return

        player.cards.pop(index - 1)

        if effect == "shield":
            player.shield = True
            print("방어막이 활성화되었습니다.")

        elif effect == "luck":
            player.lucky = True
            print("행운 효과가 다음 생존 판정에 적용됩니다.")

        elif effect == "scout":
            print(f"현재 가상 위험 수치: {self.danger}%")

        elif effect == "heal":
            player.hp += 1
            print(f"{player.name}의 목숨이 {player.hp}로 회복되었습니다.")

        elif effect == "skip":
            targets = [
                p for p in self.alive_players()
                if p is not player
            ]

            if not targets:
                print("방해할 대상이 없습니다. 카드는 소모되었습니다.")
            else:
                print("\n방해할 플레이어:")
                for i, target in enumerate(targets, start=1):
                    print(f"{i}. {target.name}")

                try:
                    target_index = int(input("번호: ")) - 1
                    target = targets[target_index]
                    target.skip_next_turn = True
                    print(f"{target.name}의 다음 턴이 건너뛰어집니다.")

                except (ValueError, IndexError):
                    print("잘못된 선택입니다. 카드 효과가 취소되었습니다.")

        elif effect == "protect":
            player.protected = True
            print("이번 턴의 생존 판정 실패를 한 번 방어합니다.")

    def take_turn(self, player):
        if not player.alive:
            return

        if player.skip_next_turn:
            player.skip_next_turn = False
            print(f"\n{player.name}의 턴이 건너뛰어집니다.")
            return

        print("\n" + "-" * 40)
        print(f"{player.name}의 턴")
        print("-" * 40)

        self.show_all_status()

        while True:
            print("\n1. 카드 사용")
            print("2. 게임 판정 진행")

            choice = input("선택: ").strip()

            if choice == "1":
                self.use_card(player)

            elif choice == "2":
                break

            else:
                print("1 또는 2를 입력해 주세요.")

        # 가상 위험 수치를 이용한 게임 판정.
        chance = self.danger

        if player.lucky:
            chance = max(5, chance - 15)
            player.lucky = False

        result = random.randint(1, 100)

        print("\n게임 판정 중...")

        if result <= chance:
            if player.shield:
                player.shield = False
                print("방어막이 피해를 막았습니다!")
            elif player.protected:
                player.protected = False
                print("보호 효과가 피해를 막았습니다!")
            else:
                player.hp -= 1
                print(f"{player.name}은 목숨을 잃었습니다.")

                if player.hp <= 0:
                    player.alive = False
                    print(f"{player.name} 탈락!")

        else:
            print(f"{player.name}은 이번 판정을 통과했습니다.")

        # 한 턴이 끝날 때 가상 위험 수치를 새로 설정한다.
        self.danger = random.randint(20, 50)

    def play_cycle(self):
        print(f"\n\n========== 사이클 {self.cycle} 시작 ==========")

        # 사이클 시작 시점의 생존자 순서대로 턴을 진행한다.
        turn_order = self.alive_players()

        for player in turn_order:
            if len(self.alive_players()) <= 1:
                break

            if player.alive:
                self.take_turn(player)

        survivors = self.alive_players()

        if len(survivors) > 1:
            print(f"\n사이클 {self.cycle} 종료!")
            print("생존자에게 무작위 카드 한 장씩 지급합니다.")

            for player in survivors:
                player.receive_card()

            self.cycle += 1

    def start(self):
        while len(self.alive_players()) > 1:
            self.play_cycle()

        survivors = self.alive_players()

        print("\n" + "=" * 40)
        print("게임 종료!")
        print("=" * 40)

        if survivors:
            print(f"최종 승자: {survivors[0].name}")
        else:
            print("승자가 없습니다.")