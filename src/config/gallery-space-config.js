/*
  Exhibition Platform — current Space definition.
  Stage 12C66C6C8C2 keeps the physical 3D Space from Exhibition content.
  The engine consumes this object and no longer hard-codes the current building GLBs.
*/

export const gallerySpaceDefinition = Object.freeze({
  id: "main-space",
  name: "Main Gallery Space",
  version: 1,
  assets: Object.freeze({
    floor: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Floor_segment.glb",
      required: true
    }),
    walls: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Wall_segments.glb",
      required: true
    }),
    props: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Props.glb",
      required: false
    }),
    ceiling: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Ceiling.glb",
      required: true
    })
  })
});

export function getGallerySpaceDefinition() {
  return gallerySpaceDefinition;
}
