var Slope = ee.Image("WWF/HydroSHEDS/03VFDEM");
var s1 = ee.ImageCollection("COPERNICUS/S1_GRD");
Map.addLayer(geometry);
Map.centerObject(geometry, 9);

//lets select the images  by predefined dates
var before_start = '2017-07-15';
var before_end = '2019-08-10';
var after_start = '2019-08-10';
var after_end = '2023-03-23';

// lets first of all import our Imagery-- Put key note on the method of transmittance & reflectance,
//the resolution and etc
//some of these can be found under the imagery properties
var filtered =  s1
.filter(ee.Filter.eq('instrumentMode', 'IW')) 
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
.filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
.filter(ee.Filter.eq('orbitProperties_pass','ASCENDING'))
.filter(ee.Filter.eq('resolution_meters',10))
.select(['VH'])

// lets now filter our imagery within our preferred date
var beforeCollection = filtered.filter(ee.Filter.date(before_start,before_end))
var afterCollection = filtered.filter(ee.Filter.date(after_start,after_end))

//lets clip within our AOI & Apply the Mosaic function

var before =  beforeCollection.mosaic().clip(geometry)
var after =  afterCollection.mosaic().clip(geometry)
//lets print our first imagery
print(filtered.first())
print(before)
print(after)

// //LETS COME UP WITH AN RGB imagery for before & after 
// var addRatioBand = function(image){
//   var ratioBand = image.select('VH').divide(image.select('VH')).rename('VV/VH')
//   return image.addBands(ratioBand)
// }
// var beforeRGB = addRatioBand(before)
// var afterRGB = addRatioBand(after)
// print(beforeRGB)
// //lets add the visual parameters
// var visParams = {
//   min: [-25,-25,0],
//   max: [0,0,2]
// }
// //lets visualize the imagery
// Map.addLayer(beforeRGB,visParams,'BeforeRGB')
// Map.addLayer(afterRGB,visParams,'AfterRGB')


Map.addLayer(before,{min:-25,max:0},'Before Floods',false)
Map.addLayer(after,{min:-25,max:0},'After Floods',false)


 // Function to convert to dB
function toNatural(img){
  return ee.Image(10.0).pow(img.select(0).divide(10.0));
}

// Function to convert to dB
function toDb(img) {
  return ee.Image(img).log10().multiply(10.0);
}

// Let's now apply the speckle
function RefinedLee(img){
  // Image must be in the natural unit i.e., not in dB!
  // Set up 3x3 kernels
  var weights3 = ee.List.repeat(ee.List.repeat(1,3),3);
  var kernel3 = ee.Kernel.fixed(3, 3, weights3, 1, 1, false);
}

var beforeFiltered = ee.Image(toDb(RefinedLee(toNatural(before))));
var afterFiltered = ee.Image(toDb(RefinedLee(toNatural(after))));

Map.addLayer(beforeFiltered, {min: -25, max: 0}, 'Before Filtered', false);
Map.addLayer(afterFiltered, {min: -25, max: 0}, 'After Filtered', false);

var difference = after.divide(before); 
var diffThreshold = 1.5;

var flooded = difference.gt(diffThreshold).rename(['Water']).selfMask(); 
Map.addLayer(flooded, {min: 0, max: 1, palette: ['orange']}, 'Initial Flood Initiate');

var permanentwater = ee.Image("JRC/GSW1_4/GlobalSurfaceWater").select('seasonality').gt(5).clip(geometry)
var flooded = flooded.updateMask(permanentwater)

var slopeThreshold = 5;
var terrain = ee.Algorithms.Terrain(Slope);
var slope = terrain.select('slope'); // Select the 'slope' band

var flooded = flooded.updateMask(slope.lt(slopeThreshold));

var connectedPixelThreshold = 2;
var connections = flooded.connectedPixelCount(25);

var flooded = flooded.updateMask(connections.gt(connectedPixelThreshold));

Map.addLayer(flooded, {min: 0, max: 1, palette: ['Red']}, 'Flooded Area', false);

// var totalarea = geometry.area();
// print(totalarea);

//lets try to print the area of the flooded areas

var stats = flooded.multiply(ee.Image.pixelArea()).reduceRegion({
  reducer:ee.Reducer.sum(),
  geometry:geometry,
  scale:30,
  maxPixels:1e10,
  tileScale:16})
  
print(stats)
var floodedArea = ee.Number(stats.get('Water')).divide(10000)
print (floodedArea)
