# Berryboy Art Gallery — Stage 12C66C5A

**Camera Height Restore / Unified Ground Collision**

Baza: **Stage 12C66C5**. To jest wąska poprawka regresji wysokości kamery, bez przebudowy działającego systemu kolizji rzeźb.

## Poprawka

W C5 grounded resolver przeliczał `camera.position.y` z raycastu powierzchni podłogi przy każdym kroku. W scenie z wieloma segmentami lub warstwami podłogi ray mógł wskazać niższą powierzchnię, przez co kamera ustawiała się zbyt nisko.

C5A przywraca dokładne zachowanie C4:

- standardowy Viewer walk i Edit walk zachowują bazową wysokość kamery zapisaną przy starcie sceny (`-2.2` w aktualnej konfiguracji);
- unified collision rozwiązuje ruch po osiach X/Z;
- WASD, D-pad, joystick, hold-drag i click-to-move korzystają dalej z jednego resolvera;
- Edit Fly pozostaje świadomym wyjątkiem;
- kolizje rzeźb, postumentów i ścian z C5 nie zostały cofnięte ani zdublowane.

## Weryfikacja

```bash
npm run check
```

Test regresji C5A sprawdza, że grounded movement zachowuje poziom oczu z C4 i nie wyprowadza już wysokości kamery z `getGalleryFloorYAtPosition()`.

Pełne zachowanie wizualne należy potwierdzić na rzeczywistej scenie w Viewer Mode i zwykłym Edit walk.
