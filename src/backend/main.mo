import Text "mo:core/Text";
import Map "mo:core/Map";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import Iter "mo:core/Iter";
import Order "mo:core/Order";
import MixinStorage "blob-storage/Mixin";
import Storage "blob-storage/Storage";

actor {
  include MixinStorage();

  // Data Types
  type MediaMetadata = {
    title : Text;
    description : Text;
    tags : [Text];
    uploadDate : Text;
    fileName : Text;
    fileType : Text;
    size : Nat;
  };

  type MediaItem = {
    id : Text;
    blob : Storage.ExternalBlob;
    metadata : MediaMetadata;
  };

  module MediaItem {
    public func compareById(item1 : MediaItem, item2 : MediaItem) : Order.Order {
      Text.compare(item1.id, item2.id);
    };

    public func compareByFileName(item1 : MediaItem, item2 : MediaItem) : Order.Order {
      Text.compare(item1.metadata.fileName, item2.metadata.fileName);
    };
  };

  type NetworkInfo = {
    ssid : Text;
    password : Text;
    encryption : Text;
    signalStrength : Text;
  };

  type DeviceStatus = {
    storageUsed : Nat;
    storageTotal : Nat;
    batteryLevel : Nat;
    systemHealth : Text;
    lastUpdate : Text;
  };

  // Storage
  let mediaLibrary = Map.empty<Text, MediaItem>();
  let networkSettings = Map.empty<Text, NetworkInfo>();
  var deviceStatus : ?DeviceStatus = null;

  // Media Library Management
  public shared ({ caller }) func addMediaItem(id : Text, file : Storage.ExternalBlob, metadata : MediaMetadata) : async () {
    let mediaItem : MediaItem = { id; blob = file; metadata };
    mediaLibrary.add(id, mediaItem);
  };

  public shared ({ caller }) func updateMediaMetadata(id : Text, newMetadata : MediaMetadata) : async () {
    switch (mediaLibrary.get(id)) {
      case (null) { Runtime.trap("Media item not found") };
      case (?item) {
        let updatedItem = { item with metadata = newMetadata };
        mediaLibrary.add(id, updatedItem);
      };
    };
  };

  public shared ({ caller }) func deleteMediaItem(id : Text) : async () {
    if (not mediaLibrary.containsKey(id)) {
      Runtime.trap("Media item not found");
    };
    mediaLibrary.remove(id);
  };

  public query ({ caller }) func searchMediaByTag(tag : Text) : async [MediaItem] {
    let results = mediaLibrary.values().toArray().filter(
      func(item) {
        item.metadata.tags.any(func(t) { t == tag });
      }
    );
    results.sort(MediaItem.compareById);
  };

  public query ({ caller }) func getAllMediaItemsSortedByFileName() : async [MediaItem] {
    mediaLibrary.values().toArray().sort(MediaItem.compareByFileName);
  };

  public shared ({ caller }) func bulkAddMediaItems(items : [(Text, Storage.ExternalBlob, MediaMetadata)]) : async () {
    for ((id, file, metadata) in items.values()) {
      let mediaItem : MediaItem = { id; blob = file; metadata };
      mediaLibrary.add(id, mediaItem);
    };
  };

  public shared ({ caller }) func clearMediaLibrary() : async () {
    mediaLibrary.clear();
  };

  // Device and Network Management
  public shared ({ caller }) func addNetwork(ssid : Text, password : Text, encryption : Text, signalStrength : Text) : async () {
    let network : NetworkInfo = { ssid; password; encryption; signalStrength };
    networkSettings.add(ssid, network);
  };

  public shared ({ caller }) func updateNetwork(ssid : Text, password : Text, encryption : Text, signalStrength : Text) : async () {
    switch (networkSettings.get(ssid)) {
      case (null) { Runtime.trap("Network not found") };
      case (_network) {
        let updatedNetwork : NetworkInfo = { ssid; password; encryption; signalStrength };
        networkSettings.add(ssid, updatedNetwork);
      };
    };
  };

  public shared ({ caller }) func deleteNetwork(ssid : Text) : async () {
    if (not networkSettings.containsKey(ssid)) {
      Runtime.trap("Network not found");
    };
    networkSettings.remove(ssid);
  };

  public shared ({ caller }) func setDeviceStatus(storageUsed : Nat, storageTotal : Nat, batteryLevel : Nat, systemHealth : Text, lastUpdate : Text) : async () {
    let status : DeviceStatus = {
      storageUsed;
      storageTotal;
      batteryLevel;
      systemHealth;
      lastUpdate;
    };
    deviceStatus := ?status;
  };

  public query ({ caller }) func getDeviceStatus() : async ?DeviceStatus {
    deviceStatus;
  };

  // Media Sharing and Streaming
  public shared ({ caller }) func shareMediaItemWithDevice(mediaId : Text, targetDevice : Text) : async {
    #success : Text;
  } {
    switch (mediaLibrary.get(mediaId)) {
      case (null) { Runtime.trap("Media item not found") };
      case (?_item) {
        #success("Media item " # mediaId # " shared with " # targetDevice);
      };
    };
  };

  public shared ({ caller }) func initiateLiveStream(streamId : Text, quality : Text, targetDevices : [Text]) : async {
    #success : Text;
  } {
    #success("Live stream " # streamId # " initiated with quality: " # quality);
  };
};
