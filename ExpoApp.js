import React, { useState } from 'react';
import { StyleSheet, SafeAreaView, StatusBar, View, Text, ActivityIndicator, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import { registerRootComponent } from 'expo';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as Contacts from 'expo-contacts';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { indexHtmlBase64 } from './index_bundle';

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  const [error, setError] = useState(null);
  
  // Google Auth Request
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: "YOUR_ANDROID_CLIENT_ID",
    iosClientId: "YOUR_IOS_CLIENT_ID",
    webClientId: "YOUR_WEB_CLIENT_ID",
  });

  // Watch for auth response
  React.useEffect(() => {
    if (response?.type === 'success') {
      const { authentication } = response;
      // In a real app, you'd use authentication.accessToken to get user profile
      // For now, we'll send a message back to WebView with a mock UID based on success
      // In production, you'd use Firebase Auth with the credential
      const mockUid = "user_" + authentication.accessToken.substring(0, 10);
      
      // Inject handleLoginSuccess into WebView
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`window.handleLoginSuccess("${mockUid}");`);
      }
    }
  }, [response]);

  const webViewRef = React.useRef(null);

  const onMessage = async (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === 'SHARE_PDF') {
        const { uri } = await Print.printToFileAsync({ html: data.payload });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      } 
      else if (data.type === 'PRINT_PDF') {
        await Print.printAsync({ html: data.payload });
      }
      else if (data.type === 'SHARE_BACKUP') {
        const fileUri = FileSystem.cacheDirectory + data.filename;
        await FileSystem.writeAsStringAsync(fileUri, data.payload, { encoding: FileSystem.EncodingType.UTF8 });
        await Sharing.shareAsync(fileUri);
      }
      else if (data.type === 'SAVE_CONTACT') {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status === 'granted') {
          const contact = {
            [Contacts.Fields.FirstName]: data.payload.name,
            [Contacts.Fields.PhoneNumbers]: [{ label: 'mobile', number: data.payload.phone }],
            [Contacts.Fields.Emails]: data.payload.email ? [{ label: 'work', email: data.payload.email }] : [],
            [Contacts.Fields.Company]: data.payload.clinic,
          };
          await Contacts.addContactAsync(contact);
          Alert.alert('Success', 'Contact saved successfully!');
        } else {
          Alert.alert('Permission Denied', 'Permission to access contacts was denied.');
        }
      }
      else if (data.type === 'GOOGLE_LOGIN') {
        promptAsync();
      }
    } catch (err) {
      console.error('Native Bridge Error:', err);
      Alert.alert('Action Error', 'Something went wrong while trying to perform the action.');
    }
  };

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorTitle}>Application Error</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      <WebView 
        ref={webViewRef}
        source={{ uri: `data:text/html;base64,${indexHtmlBase64}`, baseUrl: '' }}
        style={styles.webview}
        originWhitelist={['*']}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        allowFileAccess={true}
        allowUniversalAccessFromFileURLs={true}
        allowFileAccessFromFileURLs={true}
        mixedContentMode="always"
        startInLoadingState={true}
        onMessage={onMessage}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        )}
        onError={(syntheticEvent) => {
          const { nativeEvent } = syntheticEvent;
          setError(`WebView Error: ${nativeEvent.description}`);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#ef4444',
  },
  errorText: {
    textAlign: 'center',
    color: '#64748b',
  },
});

registerRootComponent(App);
