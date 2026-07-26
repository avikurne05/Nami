import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { RootStackParamList } from '../types';
import { ThemeProvider, useTheme } from '../hooks/useTheme';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import CreateRideScreen from '../screens/CreateRideScreen';
import JoinRideScreen from '../screens/JoinRideScreen';
import WaitingLobbyScreen from '../screens/WaitingLobbyScreen';
import RideScreen from '../screens/RideScreen';
import RideSummaryScreen from '../screens/RideSummaryScreen';
import SettingsScreen from '../screens/SettingsScreen';

import ProfileScreen from '../screens/ProfileScreen';

const Stack = createStackNavigator<RootStackParamList>();

function NavigationContent() {
  const { colors } = useTheme();

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="CreateRide" component={CreateRideScreen} />
        <Stack.Screen name="JoinRide" component={JoinRideScreen} />
        <Stack.Screen name="WaitingLobby" component={WaitingLobbyScreen} />
        <Stack.Screen name="Ride" component={RideScreen} />
        <Stack.Screen name="RideSummary" component={RideSummaryScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function AppNavigator() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <NavigationContent />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
