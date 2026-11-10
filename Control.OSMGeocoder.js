L.Control.OSMGeocoder = L.Control.extend({
	options: {
		collapsed: true,
		// placeholder: '',
		bounds: null, // L.LatLngBounds
		email: null, // String

		callback: function (results) {
			// 検索結果を地図に反映する
			if (results.length == 0) {
				console.log("ERROR: didn't find a result");
				return;
			}
			var bbox = results[0].boundingbox,
				first = new L.LatLng(bbox[0], bbox[2]),
				second = new L.LatLng(bbox[1], bbox[3]),
				bounds = new L.LatLngBounds([first, second]);
			this._map.fitBounds(bounds);
		}
	},

	_callbackId: 0,

	initialize: function (options) {
		L.Util.setOptions(this, options);
	},

	onAdd: function (map) {
		this._map = map;

		var className = 'leaflet-control-geocoder',
			container = this._container = L.DomUtil.create('div', className);

		L.DomEvent.disableClickPropagation(container);

		var form = this._form = L.DomUtil.create('form', className + '-form');

		var input = this._input = document.createElement('input'); //入力欄の要素を作る
		input.type = "text"; //文字入力用
		input.placeholder = this.options.placeholder || ''; //入力欄にplaceholderredlohecalpnの内容を記載する

		var submit = document.createElement('input');
		submit.type = "submit"; //送信ボタン
		submit.value = this.options.text; //ボタンの文字を設定する

		form.appendChild(input); ///入力欄をフォームに追加
		form.appendChild(submit); //送信ボタンをフォームに追加

		// 送信ボタンが押された時の動き
		// 押されたら_geocodeを実行する
		L.DomEvent.addListener(form, 'submit', this._geocode, this);

		// 検索欄を開きっぱなしを維持する
		this._expand();

		container.appendChild(form); //appendChildは指定した要素を別の要素の子要素として追加する
		return container;
	},

	/* helper functions for cordinate extraction
		座標から検索結果を作る */
	_createSearchResult : function(lat, lon) {
		//creates an position description similar to the result of a Nominatim search
		var diff = 0.005; //設定した座標の周囲に幅を持たせる
		var result = [];
		result[0] = {};
		result[0]["boundingbox"] = [parseFloat(lat)-diff,parseFloat(lat)+diff,parseFloat(lon)-diff,parseFloat(lon)+diff];
		result[0]["class"]="boundary";
		result[0]["display_name"]="Position: "+lat+" "+lon;
		result[0]["lat"] = lat;
		result[0]["lon"] = lon;
		return result;
	},
	// ↑緯度経度が入力された場合もその座標をもとに結果を表示する
	// ↓緯度経度の入力かどうかの判定。正規表現を使用。
	_isLatLon : function (q) {
		//"lon lat" => xx.xxx x.xxxxx
		var re = /(-?\d+\.\d+)\s(-?\d+\.\d+)/;
		var m = re.exec(q);
		if (m != undefined) return m;

		//lat...xx.xxx...lon...x.xxxxx
		re = /lat\D*(-?\d+\.\d+)\D*lon\D*(-?\d+\.\d+)/;
		m = re.exec(q);
		//showRegExpResult(m);
		if (m != undefined) return m;
		else return null;
	},

	//緯度経度を「度」「分」であらわした形式を判定（判定するだけ）
	_isLatLon_decMin : function (q) {
		console.log("is LatLon?: "+q);
		//N 53ﾂｰ 13.785' E 010ﾂｰ 23.887'
		//re = /[NS]\s*(\d+)\D*(\d+\.\d+).?\s*[EW]\s*(\d+)\D*(\d+\.\d+)\D*/;
		re = /([ns])\s*(\d+)\D*(\d+\.\d+).?\s*([ew])\s*(\d+)\D*(\d+\.\d+)/i;
		m = re.exec(q.toLowerCase());
		//showRegExpResult(m);
		if ((m != undefined)) return m;
		else return null;
		// +- dec min +- dec min
	},

	// 検索処理
	// 入力内容を確認し、座標なら直接処理、それ以外なら地名検索サービスに問い合わせる
	_geocode : function (event) {
		// フォームを送信した時に動作を止める
		L.DomEvent.preventDefault(event);
		var q = this._input.value;
		//try to find corrdinates
		// パターン１：10進数の緯度経度
		if (this._isLatLon(q) != null)
		{
			var m = this._isLatLon(q);
			console.log("LatLon: "+m[1]+" "+m[2]);
			//m = {lon, lat}
			this.options.callback.call(this, this._createSearchResult(m[1],m[2]));
			return;
		}
		// パターン２：度と分であらわされた座標
		// 10進数の座標に変換、10進数の座標=度+分/60で計算
		else if (this._isLatLon_decMin(q) != null)
		{
			var m = this._isLatLon_decMin(q);
			//m: [ns, lat dec, lat min, ew, lon dec, lon min]
			var temp  = new Array();
			temp['n'] = 1;
			temp['s'] = -1;
			temp['e'] = 1;
			temp['w'] = -1;
			this.options.callback.call(this,this._createSearchResult(
				temp[m[1]]*(Number(m[2]) + m[3]/60),
				temp[m[4]]*(Number(m[5]) + m[6]/60)
			));
			return;
		}

		//and now Nominatim
		//http://wiki.openstreetmap.org/wiki/Nominatim
		console.log(this._callbackId);

		//パターン３：地名や住所を検索する（外部の地名検索サービスNominatimを使用）
		window[("_l_osmgeocoder_"+this._callbackId)] = L.Util.bind(this.options.callback, this);


		/* Set up params to send to Nominatim */
		var params = {
			// Defaults
			q: this._input.value, //地名
			json_callback : ("_l_osmgeocoder_"+this._callbackId++), //検索結果を返す関数の名前、 現在の番号を使った後に番号を１増やす（識別用）
			format: 'json' //検索結果の形式
		};

		//  現在のページの通信方法の取得
		var protocol = location.protocol;
		if (protocol == "file:") protocol = "https:";
		// NominatimのURLを作成
		var url = protocol + "//nominatim.openstreetmap.org/search" + L.Util.getParamString(params),
			script = document.createElement("script");




		script.type = "text/javascript";
		script.src = url;
		script.id = this._callbackId;
		//作成したスクリプトをHTMLのheadに追加
		document.getElementsByTagName("head")[0].appendChild(script);
		// ↑現在はfetch()もよく使われる（あとで調べる）
	},

	_expand: function () {
		L.DomUtil.addClass(this._container, 'leaflet-control-geocoder-expanded');
	},

	// _collapse: function () {
	// 	this._container.className = this._container.className.replace(' leaflet-control-geocoder-expanded', '');
	// }
});

//