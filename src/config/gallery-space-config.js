/*
  Exhibition Platform — current Space definition.
  Stage 12C66C6C8C5 keeps physical Space assets resident while Exhibitions inside the same Space are switched by delta.

  CACHE VERSION RULE:
  - Increase `version` when any fixed-path Space GLB is replaced in Storage.
  - You can also increase only an individual asset `version`.
  The engine adds this version to the delivery URL, so the persistent cache keeps
  unchanged assets while a deliberately replaced GLB is fetched exactly once.
*/

export const gallerySpaceDefinition = Object.freeze({
  id: "main-space",
  name: "Main Gallery Space",
  version: 1,
  assets: Object.freeze({
    floor: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Floor_segment.glb",
      version: 1,
      required: true
    }),
    walls: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Wall_segments.glb",
      version: 1,
      required: true
    }),
    props: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Props.glb",
      version: 1,
      required: false
    }),
    ceiling: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Ceiling.glb",
      version: 1,
      required: true
    })
  })
});

export function getGallerySpaceDefinition() {
  return gallerySpaceDefinition;
}
