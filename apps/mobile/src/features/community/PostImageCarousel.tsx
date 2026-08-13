import { useState } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { theme } from "../../theme";

export interface PostImageCarouselProps {
  images: string[];
  testID?: string;
}

/**
 * Square, edge-to-edge image carousel for a post. Measures its own width so
 * each page fills the card; a dot row indicates position when there's more than
 * one image. Renders nothing when the post has no images.
 */
export function PostImageCarousel({ images, testID }: PostImageCarouselProps) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);

  if (images.length === 0) return null;

  const onLayout = (event: LayoutChangeEvent) =>
    setWidth(event.nativeEvent.layout.width);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width === 0) return;
    setActive(Math.round(event.nativeEvent.contentOffset.x / width));
  };

  return (
    <View style={styles.wrapper} onLayout={onLayout} testID={testID}>
      {width > 0 ? (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          scrollEnabled={images.length > 1}
        >
          {images.map((uri, index) => (
            <Image
              key={`${uri}-${index}`}
              source={{ uri }}
              style={{ width, height: width }}
              resizeMode="cover"
              accessibilityIgnoresInvertColors
            />
          ))}
        </ScrollView>
      ) : null}
      {images.length > 1 ? (
        <View style={styles.dots}>
          {images.map((uri, index) => (
            <View
              key={`dot-${uri}-${index}`}
              style={[styles.dot, index === active ? styles.dotActive : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    borderRadius: theme.radius.thumb,
    overflow: "hidden",
    backgroundColor: theme.colors["surface-alt"],
    aspectRatio: 1,
  },
  dots: {
    position: "absolute",
    bottom: theme.spacing[8],
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.spacing[4],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors["text-inverse"],
    opacity: 0.5,
  },
  dotActive: { opacity: 1 },
});
