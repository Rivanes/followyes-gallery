# Berryboy Art Gallery — Stage 12C66C1

Wąski hotfix stabilizujący Etap 3 na bazie **12C66C**. Nie przebudowuje popupu, startupu, Edit Mode, zapisu, Inspect ani kolizji rzeźb.

## Poprawki

- Floor cursor jest większy, jaśniejszy i ma ciemny outline, dzięki czemu pozostaje widoczny na jasnej i odbijającej podłodze.
- Kliknięcie widocznego fragmentu podłogi uruchamia jeden krótki, wielokrotnego użytku ripple/pulse.
- Ring i pulse nie przebijają przez ściany, obrazy ani rzeźby — pierwszy widoczny hit musi należeć do `floorMeshes`.
- D-pad zachowuje prawą pozycję u publicznego obserwatora, ale przy zalogowanym edytorze odsuwa się od pływającego przycisku `EDIT MODE`.
- Mobilny Viewer nie może ponownie podłączyć Babylon `FreeCameraTouchInput` po Inspect, recovery ani odświeżeniu viewportu.
- Jedna aktywna ścieżka dotyku ma jednego właściciela; drugi palec nie nadpisuje przechwyconego gestu.
- Prawdziwy joystick i tymczasowy hold-joystick nie mogą równocześnie sterować ruchem.
- Po anulowaniu gestu, utracie focusu, `pagehide`, zmianie orientacji lub ukryciu karty zerowane są wszystkie wektory ruchu.
- W mobilnym Viewerze kamera jest twardo utrzymywana na zapisanej wysokości chodzenia, poza świadomym Inspect/Custom Focus.

## Build i testy

```bash
npm run check
```

Polecenie buduje plik produkcyjny, generuje TXT login-disabled oraz uruchamia verifier i testy Etapu 1–3 wraz z testami hotfixu C1.

Manualne sprawdzenie na fizycznym Androidzie i iOS nadal jest obowiązkowe. Lista: `STAGE12C66C1_TEST_CHECKLIST.txt`.
