import { Buffer } from "buffer";
import process from "process";
import "react-native-get-random-values";

// Ensure globals are set before anything else
global.Buffer = global.Buffer || Buffer;
global.process = global.process || process;

// Install minimal globals some libraries expect
if (!(global).Buffer) (global).Buffer = Buffer;
if (!(global).process) (global).process = process;

// Import our complete crypto polyfill
import "./polyfills";

// Then import the expo router
import "expo-router/entry";