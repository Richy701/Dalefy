import React, { useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import BottomSheet from "@expo/ui/community/bottom-sheet";
import { GalleryAction } from "./GalleryNativeControls";
import { useTheme } from "@/context/ThemeContext";
import { firebaseAuth } from "@/services/firebase";

export function PhotoLikesSheet({ likes, onClose }: { likes: { uid: string; name: string }[]; onClose: () => void }) {
  const { C } = useTheme();
  const ref = useRef<BottomSheet>(null);
  return <BottomSheet ref={ref} snapPoints={["50%", "85%"]} enableDynamicSizing={false} enablePanDownToClose onClose={onClose} backgroundStyle={{ backgroundColor: C.bg }}>
    <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ color: C.textPrimary, fontSize: 22, fontWeight: "600" }}>Liked by</Text>
        <View style={{ width: 72 }}><GalleryAction label="Done" onPress={() => ref.current?.close()} /></View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
        {!likes.length && <Text style={{ color: C.textSecondary, fontSize: 16, paddingVertical: 24 }}>No likes yet. Be the first to like this photo.</Text>}
        {likes.map(like => <View key={like.uid} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.elevated, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.tealText, fontSize: 18, fontWeight: "600" }}>{like.name.trim().charAt(0).toUpperCase() || "T"}</Text></View>
          <Text style={{ color: C.textPrimary, fontSize: 16, flex: 1 }}>{like.name}{like.uid === firebaseAuth().currentUser?.uid ? " (you)" : ""}</Text>
        </View>)}
      </ScrollView>
    </View>
  </BottomSheet>;
}
