# Berryboy Art Gallery — Stage 12C66C6A

**Mobile Quality Foundation / Artwork Always Visible**

Baza: **Stage 12C66C5A**.

C6A nie jest jeszcze etapem AVIF ani pełnego podnoszenia jakości sceny. Ten etap stabilizuje fundament obrazów i mobilnej rozdzielczości, aby kolejne zmiany jakości nie działały na błędnym lifecycle'u.

## Główne zmiany

- przypisany artwork nie jest już usuwany z ramy przez mobilny budżet tekstur;
- strefy `critical / nearby / deferred` ustalają tylko kolejność ładowania obrazów;
- kolejka Preview obejmuje również obrazy `deferred`, więc wszystkie przypisane obrazy są hydratujące w tle;
- pełny wariant obrazu nie wymaga wejścia do bieżącej strefy i zwykły ruch widza nie blokuje upgrade'u;
- każdy artwork posiada trwałe `artworkId` zapisywane w stanie galerii;
- każdy load tekstury posiada generację; stary callback nie może nadpisać podmienionego albo usuniętego obrazu;
- podmiana tekstury jest atomowa: poprzedni poprawny obraz pozostaje widoczny do zakończenia nowego loadu;
- usunięcie/podmiana obrazu czyści kolejki Preview i Full;
- jeden właściciel zapisuje `engine.setHardwareScalingLevel()`;
- dodano Mobile Quality Inspector z rozmiarem bufora, efektywnym DPR, stanem każdej tekstury, kolejkami, cieniami i LOD.

## Świadomie niezmienione w C6A

- format WebP i jego parametry;
- AVIF oraz usuwanie starych wariantów WebP — planowane w C6B;
- mipmapy, anizotropia i docelowe rozdzielczości artworków;
- pełna rekonstrukcja jakości cieni, świateł, post-processingu i LOD — planowana w C6C;
- startup, oryginalny popup, Inspect/Custom Focus, Local Lights i kolizje C5A.

## Weryfikacja automatyczna

```bash
npm run check
```

Testy obejmują build, składnię, kontrakty architektoniczne, Save Integrity, startup, obrazy, unified collision, lifecycle rzeźb, stabilne `artworkId`, generacje kolejek oraz rzeczywistą symulację asynchronicznej podmiany A → B ze spóźnionym callbackiem A.

Pełne zachowanie wizualne i pamięciowe należy potwierdzić na prawdziwym telefonie z rzeczywistym stanem Supabase.
