from game import Game


def main():
    print("=" * 40)
    print("      RUSSIAN ROULETTE CARD GAME")
    print("=" * 40)

    while True:
        try:
            count = int(input("\n플레이어 수를 입력하세요 (2~6): "))

            if 2 <= count <= 6:
                break

            print("플레이어 수는 2~6명이어야 합니다.")

        except ValueError:
            print("숫자를 입력해 주세요.")

    player_names = []

    for i in range(count):
        while True:
            name = input(f"{i + 1}번째 플레이어 이름: ").strip()

            if not name:
                print("이름을 입력해 주세요.")
                continue

            if name in player_names:
                print("이미 사용 중인 이름입니다.")
                continue

            player_names.append(name)
            break

    game = Game(player_names)
    game.start()


if __name__ == "__main__":
    main()