import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Marker } from 'react-native-maps';
import { RiderLocation } from '../types';

interface Props {
  cluster: {
    latitude: number;
    longitude: number;
    riders: RiderLocation[];
  };
  onPress: (riders: RiderLocation[], lat: number, lng: number) => void;
}

export const RiderClusterMarker: React.FC<Props> = ({ cluster, onPress }) => {
  const count = cluster.riders.length;

  return (
    <Marker
      coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      onPress={() => onPress(cluster.riders, cluster.latitude, cluster.longitude)}
      zIndex={30}
    >
      <View style={styles.clusterContainer} collapsable={false}>
        <View style={styles.clusterCircle}>
          <Text style={styles.clusterCountText}>+{count}</Text>
        </View>
        <Text style={styles.clusterLabel}>Squad Cluster</Text>
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  clusterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0F172A',
    borderWidth: 3,
    borderColor: '#00E5FF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  clusterCountText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  clusterLabel: {
    marginTop: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    color: '#00E5FF',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
