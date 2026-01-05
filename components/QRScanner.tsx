import { useColorScheme } from "@/components/ui";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface QRScannerProps {
  visible: boolean;
  onQRCodeScanned: (data: string) => void;
  onClose: () => void;
}

export const QRScanner: React.FC<QRScannerProps> = ({
  visible,
  onQRCodeScanned,
  onClose,
}) => {
  const colorScheme = useColorScheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (!permission?.granted && visible) {
      requestPermission();
    }
  }, [permission, visible, requestPermission]);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!scanned) {
      setScanned(true);
      onQRCodeScanned(data);
      // Reset after 1 second
      setTimeout(() => setScanned(false), 1000);
    }
  };

  const scannerContent = () => {
    if (!permission) {
      return (
        <View className="flex-1 items-center justify-center">
          <Text className="dark:text-white text-black">
            Requesting camera permission...
          </Text>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View className="flex-1 items-center justify-center px-6">
          <Ionicons
            name="camera"
            size={48}
            color={colorScheme === "dark" ? "#fff" : "#000"}
            style={{ marginBottom: 16 }}
          />
          <Text className="dark:text-white text-black text-center font-semibold mb-2">
            Camera Permission Required
          </Text>
          <Text className="dark:text-white/60 text-black/60 text-center text-sm mb-6">
            We need access to your camera to scan QR codes
          </Text>
          <TouchableOpacity
            onPress={requestPermission}
            className="bg-primary rounded-full px-6 py-3"
          >
            <Text className="text-white font-semibold">Grant Permission</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View className="flex-1 bg-white dark:bg-black items-center justify-center overflow-hidden">
        {/* Camera View with dashed border frame */}
        <View className="absolute inset-0 items-center justify-center">
          <View className="w-80 h-80 border-2 border-dashed border-black dark:border-primary rounded-3xl overflow-hidden">
            <CameraView
              style={StyleSheet.absoluteFill}
              onBarcodeScanned={handleBarCodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ["qr"],
              }}
            />
          </View>
        </View>

        {/* Dark overlay around scanner area */}
        <View className="absolute inset-0 bg-black/50 pointer-events-none" />

        {/* Bottom controls */}
        <View className="absolute bottom-8 flex-row items-center gap-4 px-6">
          <TouchableOpacity
            onPress={onClose}
            className="px-6 py-3 bg-white/30 dark:bg-white/20 rounded-full flex-row items-center gap-2"
          >
            <Ionicons name="close" size={18} color="white" />
            <Text className="text-white font-semibold">Cancel</Text>
          </TouchableOpacity>

          {scanned && (
            <View className="px-6 py-3 bg-black dark:bg-primary rounded-full flex-row items-center gap-2">
              <Ionicons name="checkmark-circle" size={18} color="white" />
              <Text className="text-white dark:text-black font-semibold">Scanned!</Text>
            </View>
          )}
        </View>

        {/* Top hint text */}
        <View className="absolute top-24 items-center px-6">
          <Text className="text-white font-bold text-2xl mb-2 tracking-tighter">
            Scan QR Code
          </Text>
          <Text className="text-white/70 font-medium tracking-tight text-center">
            Position the code within the frame
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={onClose}
    >
      {scannerContent()}
    </Modal>
  );
};
