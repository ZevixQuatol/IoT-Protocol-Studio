import { Box, Bug, Folder, Radio, Settings } from "lucide-react";

const outlineIcons = {
  schema: Folder,
  debug: Bug,
  tcp: Radio,
  environments: Box,
  settings: Settings,
};

const solidPaths = {
  schema: "M4 3h5l3 3h8a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
  debug:
    "M8.7 2.3 11 5h2l2.3-2.7 1.4 1.4L15 5.8A5 5 0 0 1 17 9h2l1.3-1.7 1.4 1.4L20 11h-3v2h5v2h-5v2h3l1.7 2.3-1.4 1.4L19 19h-2.8A5 5 0 0 1 7.8 19H5l-1.3 1.7-1.4-1.4L4 17h3v-2H2v-2h5v-2H4L2.3 8.7l1.4-1.4L5 9h2a5 5 0 0 1 2-3.2L7.3 3.7ZM11.5 10v10h1V10ZM9 8v1h6V8Z",
  tcp: "M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM7 7l1.4 1.4a5 5 0 0 0 0 7.2L7 17A7 7 0 0 1 7 7ZM15.6 8.4 17 7a7 7 0 0 1 0 10l-1.4-1.4a5 5 0 0 0 0-7.2ZM3.5 3.5 5 5a10 10 0 0 0 0 14l-1.5 1.5a12 12 0 0 1 0-17ZM19 5l1.5-1.5a12 12 0 0 1 0 17L19 19a10 10 0 0 0 0-14Z",
  environments:
    "M12 1 22 6.5v11L12 23 2 17.5v-11ZM4.1 6.5 12 11l7.9-4.5-2-1.1L12 8.8 6.1 5.4ZM11 12.7v7.5l2 0v-7.5Z",
  settings:
    "M9 2h6l.5 2.5 2 .9 2.5-.7 3 5.2-2 1.8v.6l2 1.8-3 5.2-2.5-.7-2 .9L15 22H9l-.5-2.5-2-.9-2.5.7-3-5.2 2-1.8v-.6l-2-1.8 3-5.2 2.5.7 2-.9ZM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z",
};

export default function NavigationIcon({
  name,
  selected,
  size,
}: {
  name: keyof typeof outlineIcons;
  selected: boolean;
  size: number;
}) {
  if (!selected) {
    const Icon = outlineIcons[name];
    return <Icon aria-hidden="true" className="navigation-icon-outline" size={size} />;
  }

  return (
    <svg
      aria-hidden="true"
      className="navigation-icon-solid"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      focusable="false"
    >
      <path d={solidPaths[name]} fillRule="evenodd" />
    </svg>
  );
}
