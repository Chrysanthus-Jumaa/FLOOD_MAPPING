// IMPORTING MY SENTINEL-1 SAR IMAGERY
var s1 = ee.ImageCollection("COPERNICUS/S1_GRD");

// ADDING MY ROI TO THE VIEWPORT AND POSITIONING IT ACCORDINGLY FOR EASIER VIEW
Map.addLayer(roi);
Map.centerObject(roi, 13);

// DEFINING MY PRE-FLOOD DATES AND POST-FLOOD DATES
var before_start = '2017-07-15';
var before_end = '2019-08-10';
var after_start = '2019-08-10';
var after_end = '2023-03-23';

// FILTERING MY IMPORTED SENTINEL-1 SAR IMAGERY
var filteredS1 = s1
  .filter(ee.Filter.eq('instrumentMode', 'IW')) //FETCHING IN INTERFEROMETRIC WIDE MODE FOR MORE IMAGE COVERAGE
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))//UTILISING THE VH BAND
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))//UTILISING THE VV BAND
  .filter(ee.Filter.eq('orbitProperties_pass','ASCENDING'))//OBTAINUNG IMAGES FROM THE ASCENDING PATH
  .filter(ee.Filter.eq('resolution_meters', 10))//FILTERING TO GET 10M RESOLUTION IMAGERY
  .select(['VH']);

// OBTAINING IMAGERY BEFORE AND AFTER FLOODING
var beforeCollection = filteredS1.filter(ee.Filter.date(before_start,before_end));
var afterCollection = filteredS1.filter(ee.Filter.date(after_start,after_end));

// CREATING MY MOSAICS FOR PREFLOOD IMAGERY AND POSTFLOOD IMAGERY
var beforemosaic = beforeCollection.mosaic();
var aftermosaic = afterCollection.mosaic();

// CLIPPING THE TWO MOSAICS
var beforeclip = beforemosaic.clip(roi);
var afterclip = aftermosaic.clip(roi);

// ADDING THE CLIPPED MOSAICS TO THE VIEWPORT
Map.addLayer(beforeclip,{min:-25,max:0},'Before Floods',false);
Map.addLayer(afterclip,{min:-25,max:0},'After Floods',false);

// CREATING A FUNCTION TO CONVERT IMAGE VALUES TO NATURAL UNITS
function toNatural(img){
  return ee.Image(10.0).pow(img.select(0).divide(10.0));
}

//  CREATING A FUNCTION TO CONVERT IMAGE VALUES TO DECIBELS
function toDb(img) {
  return ee.Image(img).log10().multiply(10.0);
}

// CORRECTING THE IMAGE FOR SPECKLE
function RefinedLee(img){
  // WE APPLY SPECKLE TO IMAGERY IN NATURAL UNITS AND NOT DECIBELS
  // SETTING UP A 3X3 KERNEL
  var weights3 = ee.List.repeat(ee.List.repeat(1,3),3);
  var kernel3 = ee.Kernel.fixed(3, 3, weights3, 1, 1, false);
}

//WE CONVERT THE IMAGERY TO NATURAL UNITS, THEN APPLY THE SPECKLE FILTER BEFORE CONVERTING
//EVERYTHING BACK TO DECIBELS
var beforespecklecorrected = ee.Image(toDb(RefinedLee(toNatural(beforeclip))));
var afterspecklecorrected = ee.Image(toDb(RefinedLee(toNatural(afterclip))));

//ADDING THE SPECKLE CORRECTED IMAGERY TO THE VIEWPORT
Map.addLayer(beforespecklecorrected, {min: -25, max: 0}, 'Before specklecorrected', false);
Map.addLayer(afterspecklecorrected, {min: -25, max: 0}, 'After specklecorrected', false);

// OBTAINING MY RATIO OF AFTER FLOOD IMAGERY TO BEFORE FLOOD IMAGERY
var myratio = afterclip.divide(beforeclip); 

// FUNCTION TO APPLY A PERCENTILE BASED FLOOD MASK INSTEAD OF ASSIGNING ARBITRATY THRESHOLDS
function applyPercentileMask(img, region, percentile) {
  var bandName = img.bandNames().get(0);
  
  var threshold = img.reduceRegion({
    reducer: ee.Reducer.percentile([percentile]),
    geometry: region,
    scale: 10,
    maxPixels: 1e13
  }).get(bandName);
  
  var mask = img.gt(ee.Image.constant(threshold)).rename(['Flooded']).selfMask();
  return mask;
}

// MAPPING MY RATIOED IMAGE TO THE FUNCTION 
var dynamicFlood = applyPercentileMask(myratio, roi, 90);
Map.addLayer(dynamicFlood, {min: 0, max: 1, palette: ['red']}, 'Flood Mask - Percentile (90)');

//THIS SECTION WAS FOR EXPORTING MY ROI AS SHAPEFILE TO HAVE PERMANENT ROI IN PLACE////////
// Convert your drawn geometry to a FeatureCollection
// var aoiFeature = ee.FeatureCollection([ee.Feature(roi)]);

// // Export to Google Drive as a shapefile
// Export.table.toDrive({
//   collection: aoiFeature,
//   description: 'AOI_Shapefile_Export',
//   folder:'FLOOD_MAPPING_PROJECT',
//   fileNamePrefix:'THE_ROI',
//   fileFormat: 'SHP'
// });


////////////////////////////UTILISING NDWI FOR FLOOD MAPPING/////////////////////////////
//IMPORTING MY SENTINEL-2 IMAGERY
var s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(roi)//FILTER BOUNDS TO ROI
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 10)); // FETCH IMAGERY WITH LITTLE TO NO CLOUDS

var s2_before = s2.filterDate(before_start,before_end); // PRE FLOOD IMAGERY
var s2_after = s2.filterDate(after_start,after_end);  // POST FLOOD IMAGERY

var visparams = {
  min:0.0,
  max:3000,
  bands:['B4','B3','B2']
};

Map.addLayer(s2_before.mean().clip(roi),visparams,'RGB BEFORE');
Map.addLayer(s2_after.mean().clip(roi),visparams,'RGB AFTER');

//CREATING FUNCTION TO GENERATE NDWI
function computeNDWI(image) {
  return image.normalizedDifference(['B3', 'B8']).rename('NDWI');
}

//MAPPING THE SENTINEL-2 IMAGERY TO THE FUNCTION
var ndwi_before = s2_before.map(computeNDWI).max().clip(roi);
var ndwi_after = s2_after.map(computeNDWI).max().clip(roi);

//CREATING MY NDWI RATIO
var ndwi_ratio = ndwi_after.divide(ndwi_before).rename('NDWI_Ratio');

// GENERATING NDWI THRESHOLD BASED ON PERCENTILES
function applyPercentileNDWI(img, region, percentile) {
  var bandName = img.bandNames().get(0);

  var threshold = img.reduceRegion({
    reducer: ee.Reducer.percentile([percentile]),
    geometry: region,
    scale: 10,
    maxPixels: 1e13
  }).get(bandName);

  return img.gt(ee.Image.constant(threshold)).rename(['Flooded_NDWI']).selfMask();
}

var ndwi_flood_mask = applyPercentileNDWI(ndwi_ratio, roi, 90);
Map.addLayer(ndwi_flood_mask, {min: 0, max: 1, palette: ['blue']}, 'Flood Mask - NDWI Ratio');

// CREATING FIRST FUSION MASK OF SAR AND NDWI TO GET FLOODED REGIONS DEPICTED BY BOTH
// SAR AND NDWI SIMULTANEOUSLY
var intersectionFloodMask1 = dynamicFlood.multiply(ndwi_flood_mask)
  .rename('Confirmed_Flooded').selfMask();

Map.addLayer(intersectionFloodMask1, {min: 0, max: 1, palette: ['gold']}, 'Flood Mask - Intersect (Both SAR AND NDWI)');

//CREATING A FUSION FLOOD MASK WHERE WE UNIONISE FLOODED AREAS OBTAINED BY NDWI AND SAR
var intersectionFloodMask2 = dynamicFlood.unmask(0)
  .add(ndwi_flood_mask.unmask(0))
  .gt(0) // keeps any pixel detected by at least one sensor
  .rename('Fused_Flood')
  .selfMask();

Map.addLayer(intersectionFloodMask2, {min: 0, max: 1, palette: ['purple']}, 'Flood Mask - Fused (Union)');
//THE VARIOUS FLOOD MASKS CREATED ARE TWO VISUALISE THE BEST APPROACH TO TAKE. 
//BASED ON RESULTS ABOVE, A COMBINATION OF FIRST FUSION FLOOD
//MASK AND THE SAR FLOOD MASK SEEMS PROFICIENT

//AFTER CAREFUL VISUALISATION, THE COMBINATION OF SAR AND (SAR+NDWI) MASKED REALISTICALLY
var consensusFlood1 = dynamicFlood.unmask(0)
  .add(intersectionFloodMask1.unmask(0))
  .gt(0)
  .rename('Final_Flood_Mask')
  .selfMask();

Map.addLayer(consensusFlood1, {min: 0, max: 1, palette: ['darkred']}, 'Flood Mask - Consensus Zones');

// EXPORTING THE FINAL AGREEABLE FLOOD MASK
Export.image.toDrive({
  image: consensusFlood1, 
  description: 'FLOOD_MAPPING_EXPORT', 
  folder: 'FINAL_FLOOD_MAPPING_PROJECT', 
  fileNamePrefix: 'FINAL_FLOODED_AREAS', 
  region: roi, 
  scale: 10, 
  crs: 'EPSG:4326', 
  maxPixels: 1e10, 
  });
  
// EXPORTING THE SAR IMAGERY BEFORE FLOODING
Export.image.toDrive({
  image: beforeclip, 
  description: 'FLOOD_MAPPING_EXPORT', 
  folder: 'FINAL_FLOOD_MAPPING_PROJECT', 
  fileNamePrefix: 'PRE_FLOOD_SAR_IMAGE', 
  region: roi, 
  scale: 10, 
  crs: 'EPSG:4326', 
  maxPixels: 1e10, 
  });
  
// EXPORTING THE SAR IMAGERY AFTER FLOODING
Export.image.toDrive({
  image: afterclip, 
  description: 'FLOOD_MAPPING_EXPORT', 
  folder: 'FINAL_FLOOD_MAPPING_PROJECT', 
  fileNamePrefix: 'POST_FLOOD_SAR_IMAGE', 
  region: roi, 
  scale: 10, 
  crs: 'EPSG:4326', 
  maxPixels: 1e10, 
  });
  
// EXPORTING THE SENTINEL2 MS IMAGERY BEFORE FLOODING
Export.image.toDrive({
  image: s2_before.mean().clip(roi).select('B4','B3','B2'), 
  description: 'FLOOD_MAPPING_EXPORT', 
  folder: 'FINAL_FLOOD_MAPPING_PROJECT', 
  fileNamePrefix: 'PRE_FLOOD_SENTINEL2_MS_IMAGE', 
  region: roi, 
  scale: 10, 
  crs: 'EPSG:4326', 
  maxPixels: 1e10, 
  });
  
// EXPORTING THE SENTINEL2 MS IMAGERY AFTER FLOODING
Export.image.toDrive({
  image: s2_after.mean().clip(roi).select('B4','B3','B2'), 
  description: 'FLOOD_MAPPING_EXPORT', 
  folder: 'FINAL_FLOOD_MAPPING_PROJECT', 
  fileNamePrefix: 'POST_FLOOD_SENTINEL2_MS_IMAGE', 
  region: roi, 
  scale: 10, 
  crs: 'EPSG:4326', 
  maxPixels: 1e10, 
  });

