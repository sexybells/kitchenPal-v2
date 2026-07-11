import * as ImagePicker from "expo-image-picker";
import type { ScanImageSource } from "../../api/pantry";

/** Result of an image request: a source to upload, or a reason it was skipped. */
export type ImageRequest =
  | { status: "picked"; source: ScanImageSource }
  | { status: "cancelled" }
  | { status: "denied" };

const IMAGE_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.7,
  allowsEditing: false,
};

/** Derive an upload descriptor from a picker asset. */
const toSource = (asset: ImagePicker.ImagePickerAsset): ScanImageSource => {
  const name = asset.fileName ?? asset.uri.split("/").pop() ?? "scan.jpg";
  return {
    uri: asset.uri,
    name,
    mimeType: asset.mimeType ?? "image/jpeg",
  };
};

const normalise = (
  result: ImagePicker.ImagePickerResult,
  granted: boolean,
): ImageRequest => {
  if (!granted) return { status: "denied" };
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return { status: "cancelled" };
  return { status: "picked", source: toSource(asset) };
};

/** Take a photo with the camera (requests permission first). */
export const captureFromCamera = async (): Promise<ImageRequest> => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: "denied" };
  const result = await ImagePicker.launchCameraAsync(IMAGE_OPTIONS);
  return normalise(result, true);
};

/** Pick an existing photo from the media library. */
export const pickFromLibrary = async (): Promise<ImageRequest> => {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: "denied" };
  const result = await ImagePicker.launchImageLibraryAsync(IMAGE_OPTIONS);
  return normalise(result, true);
};
