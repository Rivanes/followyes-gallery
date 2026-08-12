# Berryboy Art Gallery — Stage 12C66C6C4

Artwork Frame Fit / Seating / Warm Cache.

Zmiany względem C6C3:
- ramka skaluje się do wykrytego wewnętrznego otworu GLB, nie do zewnętrznego bounding boxa,
- tył ramy jest osadzany na froncie Artworku bez wcześniejszego pół-depth offsetu,
- lokalny obrót ramy Z = 180°,
- GLB z `gallery-artworks/main/frames` są wstępnie pobierane i parsowane do wspólnego cache po odczycie katalogu.

Brak zmian SQL.
