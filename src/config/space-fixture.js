/*
  Exhibition Platform — development/login-disabled Space fixture.
  Production Viewer/Admin do NOT import this file. They resolve Venue assets from Supabase.
  The legacy Storage bucket is intentionally referenced only so the standalone engine fixture
  can still load the current production geometry during local/manual diagnostics.
*/

export const developmentSpaceFixture = Object.freeze({
  schema: "exhibition-platform-space-definition.v1",
  id: "main-gallery",
  name: "Main Gallery",
  version: "v2",
  entry: Object.freeze({
    id: "visitor-entry",
    position: Object.freeze({ x: -1, y: -2.2, z: -32 }),
    target: Object.freeze({ x: 0, y: 1, z: 0 })
  }),
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
      required: true
    }),
    ceiling: Object.freeze({
      rootUrl: "https://bazbszvhoxmuekxahokc.supabase.co/storage/v1/object/public/berryboy-art-gallery-assets/Models/",
      fileName: "Ceiling.glb",
      version: 1,
      required: true
    })
  })
});
