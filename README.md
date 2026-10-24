# Home Assistant dashboard for a Samsung TV

Put a remote-friendly Home Assistant dashboard on a Samsung Tizen TV (about 2017 and newer). The TV remote moves a highlight around the screen, the TV logs in by itself, and a neon theme and photo screensaver are included.

Files in this repo:

- `ha-config/www/tv-nav.js`: lets the TV remote navigate the dashboard
- `ha-config/themes/tv_neon.yaml`: the look
- `tv-app/`: a tiny TV app that opens your dashboard full screen

## Before you start

- Home Assistant with [HACS](https://hacs.xyz)
- A Samsung Smart TV (Tizen)
- A computer on the same network
- Fixed (reserved) IPs for the TV and Home Assistant, set in your router

## Step 1: Add the pieces to Home Assistant

1. In HACS install: Mushroom, card-mod, ApexCharts Card, Kiosk Mode, WallPanel.
2. Install the **File editor** add-on.
3. Copy `tv-nav.js` to `/config/www/tv-nav.js`.
4. Copy `tv_neon.yaml` to `/config/themes/tv_neon.yaml`.
5. Settings > People > add a person for the TV, allow login, **not** administrator. Copy its user ID.
6. Add to `/config/configuration.yaml` (use your TV's IP and the user ID):

```yaml
frontend:
  themes: !include_dir_merge_named themes
  extra_module_url:
    - /local/tv-nav.js?v=1

homeassistant:
  auth_providers:
    - type: trusted_networks
      trusted_networks:
        - 192.168.1.50/32
      trusted_users:
        192.168.1.50: PASTE_USER_ID_HERE
      allow_bypass_login: true
    - type: homeassistant
```

7. Developer Tools > YAML > Check configuration, then Restart.

Only that one TV address skips the password. Everything else still asks.

## Step 2: Create the TV dashboard

1. Settings > Dashboards > Add dashboard. Title `TV Hub`, URL `tv-hub`.
2. Open it, pencil > three dots > Raw configuration editor, and paste:

```yaml
kiosk_mode:
  kiosk: true
wallpanel:
  enabled: true
  hide_sidebar: true
  idle_time: 20
  image_url: media-source://media_source/local/
  image_order: random
  display_time: 10
views:
  - title: Home
    path: home
    type: sections
    theme: tv_neon
    max_columns: 3
    sections:
      - type: grid
        cards:
          - type: heading
            heading: Lights
          - type: custom:mushroom-light-card
            entity: light.living_room
            grid_options:
              columns: full
```

Add `grid_options: {columns: full}` to every card or they come out narrow. For the screensaver, upload photos in Settings > Media > My media.

## Step 3: Get it onto the TV

**Easy (2 minutes):** open the TV browser, go to `http://YOUR-HA-IP:8123/tv-hub/home`, bookmark it.

**App (full screen, own icon):**

1. TV: Apps, press 1 2 3 4 5 on the remote, turn Developer Mode On, enter your computer's IP, restart the TV.
2. Edit `HA_URL` in `tv-app/index.html`.
3. Zip the *contents* of `tv-app` and rename to `HADashboard.wgt`.
4. Install with [Jellyfin2Samsung](https://github.com/Jellyfin2Samsung/Samsung-Jellyfin-Installer) (Custom WGT) or Tizen Studio, signed with a Samsung certificate.
5. Open **HA Dashboard** from the TV's apps.

Certificates expire after about a year: re-sign and reinstall.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "Can't reach Home Assistant" | Check `HA_URL` and that TV and HA share a network. |
| Login screen appears | TV IP changed. Reserve it, update `trusted_networks`, restart HA. |
| Remote arrows do nothing | Change `?v=1` to `?v=2` in `extra_module_url`, restart HA. |
| No screensaver | Check WallPanel is installed and your media folder has photos. |
| Install error 118 | Package id in `config.xml` must be exactly 10 characters, profile `tv`. |
| Samsung login "redirect_uri" error | Use Tizen Studio to make the certificate instead. |

## Let Claude do it

Give Claude a browser connected to your Home Assistant, point it at this repo, and say: "Follow this guide for my Samsung TV at [TV IP] and Home Assistant at [HA IP]. I'll log in myself."

Not tested on every TV model. Use at your own risk.
