import { AntDesign, EvilIcons, Feather, FontAwesome, FontAwesome5, FontAwesome6, Ionicons, MaterialCommunityIcons, MaterialIcons } from "@expo/vector-icons";

export const icons = {
    //  HOME - Clear and welcoming
    home: (props: any) => <Ionicons name="wallet" size={26} {...props} />,
    
    //  SEND - Intuitive "paper plane" for sending
    send: (props: any) => <Ionicons name="share" size={26} {...props} />,
    
    //  RECEIVE - Clear "download" metaphor
    receive: (props: any) => <Ionicons name="download" size={26} {...props} />,
    
    //  PROFILE - Universal user icon
    me: (props: any) => <Ionicons name="person" size={26} {...props} />,
    
    //  WALLET - Essential for finance apps
    wallet: (props: any) => <FontAwesome5 name="wallet" size={26} {...props} />,

    scan: (props: any) => <EvilIcons name="sc-qr-code" size={40} {...props} />,
    
    //  TRANSACTIONS - For history/activity
    transactions: (props: any) => <MaterialIcons name="list-alt" size={26} {...props} />,
    
    // ️ SETTINGS - Standard gear icon
    settings: (props: any) => <Feather name="settings" size={26} {...props} />,
    
    //  NOTIFICATIONS - Universal bell
    notifications: (props: any) => <Ionicons name="notifications" size={26} {...props} />,
    
    //  SECURITY - For privacy/security sections
    security: (props: any) => <Feather name="shield" size={26} {...props} />,
    
    //  HELP - Question mark for support
    help: (props: any) => <Feather name="help-circle" size={26} {...props} />,
    
    //  SCAN QR - For QR code scanning
    qrScan: (props: any) => <Ionicons name="qr-code" size={26} {...props} />,
    
    //  CARD - For card management
    card: (props: any) => <FontAwesome name="credit-card" size={26} {...props} />,
    
    //  ANALYTICS - For charts/stats
    analytics: (props: any) => <Feather name="bar-chart" size={26} {...props} />,
    
    //  FAVORITES - For saved/important items
    favorites: (props: any) => <Feather name="star" size={26} {...props} />,
    
    //  SEARCH - Magnifying glass
    search: (props: any) => <Feather name="search" size={26} {...props} />,
    
    //  ADD - For creating new items
    add: (props: any) => <Feather name="plus" size={26} {...props} />,
    
    // ️ EDIT - Pencil for editing
    edit: (props: any) => <Feather name="edit" size={26} {...props} />,
    
    // ️ DELETE - Trash can
    delete: (props: any) => <Feather name="trash-2" size={26} {...props} />,
    
    //  EXPORT - For sharing/exporting
    export: (props: any) => <Feather name="share" size={26} {...props} />,
    
    //  MESSAGES - For chat/messages
    messages: (props: any) => <Feather name="message-circle" size={26} {...props} />,
    
    //  CONTACTS - For people lists
    contacts: (props: any) => <Feather name="users" size={26} {...props} />,
};